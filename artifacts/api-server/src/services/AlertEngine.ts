import { db, alertsTable, zonesTable, trendlinesTable, alertEventsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import type { MarketDataService, LatestTick } from "./MarketDataService.js";
import type { TelegramService } from "./TelegramService.js";
import type { WSManager } from "../ws/WSManager.js";
import { logger } from "../lib/logger.js";

const COOLDOWN_MS = 120_000;
const TOUCH_TOLERANCE = 0.001;

type AlertCondition = "price_above" | "price_below" | "percent_change_up" | "percent_change_down";
type ZoneState = "inside" | "above" | "below";
type TrendlineSide = "above" | "below";

interface PriceAlertRow {
  id: number;
  symbol: string;
  condition: string;
  targetPrice: number;
  message: string | null;
  telegramEnabled: boolean;
}

interface ZoneRow {
  id: number;
  symbol: string;
  upperPrice: number;
  lowerPrice: number;
  zoneType: string;
  condition: string;
  notes: string | null;
  telegramEnabled: boolean;
  cooldownUntil: Date | null;
}

interface TrendlineRow {
  id: number;
  symbol: string;
  timeframe: string;
  point1Price: number;
  point1Time: Date;
  point2Price: number;
  point2Time: Date;
  condition: string;
  drawingType: string;
  alertStatus: string;
  notes: string | null;
  telegramEnabled: boolean;
  cooldownUntil: Date | null;
}

export class AlertEngine {
  private activeAlerts: Map<number, PriceAlertRow> = new Map();
  private activeZones: Map<number, ZoneRow> = new Map();
  private activeTrendlines: Map<number, TrendlineRow> = new Map();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  private openPrices: Map<string, number> = new Map();
  private zoneStates: Map<number, ZoneState> = new Map();
  private trendlineSides: Map<number, TrendlineSide> = new Map();

  // Consecutive-tick counter for touch alerts (require ≥2 ticks inside tolerance)
  private touchCounts: Map<number, number> = new Map();
  // Tracks side at which breakout occurred (for retest: fire on return to line)
  private retestBreakouts: Map<number, TrendlineSide> = new Map();
  // In-memory dedup: prevent same alert firing twice within 10 s
  private recentlyFired: Map<number, number> = new Map();

  constructor(
    private marketData: MarketDataService,
    private telegram: TelegramService,
    private wsManager: WSManager,
  ) {}

  async start(): Promise<void> {
    await this.loadAlerts();

    this.marketData.on("tick", (tick: LatestTick) => {
      this.evaluateTick(tick).catch((err) =>
        logger.error({ err }, "AlertEngine: error evaluating tick"),
      );
    });

    this.refreshTimer = setInterval(() => {
      this.loadAlerts().catch((err) =>
        logger.error({ err }, "AlertEngine: error refreshing alerts"),
      );
    }, 60_000);

    logger.info(
      {
        priceAlerts: this.activeAlerts.size,
        zones: this.activeZones.size,
        trendlines: this.activeTrendlines.size,
      },
      "AlertEngine: started",
    );
  }

  async stop(): Promise<void> {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  async reloadAlerts(): Promise<void> {
    await this.loadAlerts();
  }

  private async loadAlerts(): Promise<void> {
    try {
      const now = new Date();

      const priceRows = await db
        .select()
        .from(alertsTable)
        .where(and(eq(alertsTable.isActive, true), eq(alertsTable.isTriggered, false)));

      this.activeAlerts.clear();
      for (const a of priceRows) {
        this.activeAlerts.set(a.id, {
          id: a.id,
          symbol: a.symbol,
          condition: a.condition,
          targetPrice: a.targetPrice,
          message: a.message ?? null,
          telegramEnabled: a.telegramEnabled,
        });
      }

      const zoneRows = await db
        .select()
        .from(zonesTable)
        .where(eq(zonesTable.isActive, true));

      this.activeZones.clear();
      for (const z of zoneRows) {
        if (z.cooldownUntil && z.cooldownUntil > now) continue;
        this.activeZones.set(z.id, {
          id: z.id,
          symbol: z.symbol,
          upperPrice: z.upperPrice,
          lowerPrice: z.lowerPrice,
          zoneType: z.zoneType,
          condition: z.condition,
          notes: z.notes ?? null,
          telegramEnabled: z.telegramEnabled,
          cooldownUntil: z.cooldownUntil,
        });
      }

      const trendlineRows = await db
        .select()
        .from(trendlinesTable)
        .where(eq(trendlinesTable.isActive, true));

      this.activeTrendlines.clear();
      for (const t of trendlineRows) {
        if (t.isTriggered) continue;                                  // never re-fire already triggered alerts
        if (t.cooldownUntil && t.cooldownUntil > now) continue;
        if ((t.alertStatus ?? "active") === "paused") continue;
        this.activeTrendlines.set(t.id, {
          id: t.id,
          symbol: t.symbol,
          timeframe: t.timeframe,
          point1Price: t.point1Price,
          point1Time: t.point1Time,
          point2Price: t.point2Price,
          point2Time: t.point2Time,
          condition: t.condition,
          drawingType: (t.drawingType ?? "trendline") as string,
          alertStatus: (t.alertStatus ?? "active") as string,
          notes: t.notes ?? null,
          telegramEnabled: t.telegramEnabled,
          cooldownUntil: t.cooldownUntil,
        });
      }

      logger.debug(
        {
          priceAlerts: this.activeAlerts.size,
          zones: this.activeZones.size,
          trendlines: this.activeTrendlines.size,
        },
        "AlertEngine: alerts loaded",
      );
    } catch (err) {
      logger.error({ err }, "AlertEngine: failed to load alerts");
    }
  }

  private async evaluateTick(tick: LatestTick): Promise<void> {
    if (!this.openPrices.has(tick.symbol)) {
      this.openPrices.set(tick.symbol, tick.price);
    }

    await this.evaluatePriceAlerts(tick);
    await this.evaluateZones(tick);
    await this.evaluateTrendlines(tick);
  }

  private async evaluatePriceAlerts(tick: LatestTick): Promise<void> {
    const triggered: number[] = [];

    for (const [id, alert] of this.activeAlerts.entries()) {
      if (alert.symbol !== tick.symbol) continue;

      const condition = alert.condition as AlertCondition;
      let shouldTrigger = false;

      switch (condition) {
        case "price_above":
          shouldTrigger = tick.price >= alert.targetPrice;
          break;
        case "price_below":
          shouldTrigger = tick.price <= alert.targetPrice;
          break;
        case "percent_change_up": {
          const open = this.openPrices.get(tick.symbol) ?? tick.price;
          shouldTrigger = ((tick.price - open) / open) * 100 >= alert.targetPrice;
          break;
        }
        case "percent_change_down": {
          const open = this.openPrices.get(tick.symbol) ?? tick.price;
          shouldTrigger = ((tick.price - open) / open) * 100 <= -Math.abs(alert.targetPrice);
          break;
        }
      }

      if (shouldTrigger) {
        triggered.push(id);
        await this.firePriceAlert(alert, tick.price);
      }
    }

    for (const id of triggered) {
      this.activeAlerts.delete(id);
    }
  }

  private async evaluateZones(tick: LatestTick): Promise<void> {
    const price = tick.price;

    for (const [id, zone] of this.activeZones.entries()) {
      if (zone.symbol !== tick.symbol) continue;

      const currentState: ZoneState =
        price < zone.lowerPrice ? "below" :
        price > zone.upperPrice ? "above" : "inside";

      const lastState = this.zoneStates.get(id);
      this.zoneStates.set(id, currentState);

      if (lastState === undefined) continue;

      const cond = zone.condition;
      let shouldFire = false;

      if (cond === "touch" || cond === "retest") {
        shouldFire = currentState === "inside" && lastState !== "inside";
      } else if (cond === "break") {
        shouldFire = currentState !== "inside" && lastState === "inside";
      }

      if (shouldFire) {
        await this.fireZoneAlert(zone, tick.price, currentState);
      }
    }
  }

  private async evaluateTrendlines(tick: LatestTick): Promise<void> {
    const price = tick.price;
    const now = Date.now();

    for (const [id, tl] of this.activeTrendlines.entries()) {
      if (tl.symbol !== tick.symbol) continue;

      const projected = this.calcTrendlinePrice(tl, now);
      if (projected === null) continue;

      const currentSide: TrendlineSide = price >= projected ? "above" : "below";
      const lastSide = this.trendlineSides.get(id);
      this.trendlineSides.set(id, currentSide);

      if (lastSide === undefined) continue;

      const cond = tl.condition;
      let shouldFire = false;

      if (cond === "breakout" || cond === "break") {
        // Fire on any side change (clean crossover)
        shouldFire = currentSide !== lastSide;

      } else if (cond === "retest") {
        // Retest: price must first break out to one side, THEN return to the line
        const breakoutSide = this.retestBreakouts.get(id);
        if (breakoutSide === undefined) {
          // Phase 1 – record the initial breakout direction
          if (currentSide !== lastSide) {
            this.retestBreakouts.set(id, currentSide);
          }
        } else {
          // Phase 2 – fire when price crosses back toward the broken side
          if (currentSide !== breakoutSide) {
            shouldFire = true;
            this.retestBreakouts.delete(id);
          }
        }

      } else if (cond === "cross_above") {
        shouldFire = currentSide === "above" && lastSide === "below";
      } else if (cond === "cross_below") {
        shouldFire = currentSide === "below" && lastSide === "above";

      } else if (cond === "touch" || cond === "touch_price") {
        // Require price to be within tolerance for ≥2 consecutive ticks
        // to prevent single-tick noise from false-triggering
        const pct = Math.abs(price - projected) / projected;
        if (pct <= TOUCH_TOLERANCE) {
          const count = (this.touchCounts.get(id) ?? 0) + 1;
          this.touchCounts.set(id, count);
          shouldFire = count >= 2;
        } else {
          this.touchCounts.delete(id); // reset when price moves away
        }

      } else if (cond === "above_price") {
        shouldFire = price >= projected && lastSide === "below";
      } else if (cond === "below_price") {
        shouldFire = price <= projected && lastSide === "above";
      } else if (cond === "enter_zone") {
        shouldFire = currentSide !== lastSide;
      } else if (cond === "exit_zone") {
        shouldFire = currentSide !== lastSide;
      } else if (cond === "rejection") {
        shouldFire = currentSide !== lastSide;
      }

      if (shouldFire) {
        // Clear touch count on fire so it resets for next cooldown cycle
        this.touchCounts.delete(id);
        await this.fireDrawingAlert(tl, tick.price, projected, currentSide);
      }
    }
  }

  private calcTrendlinePrice(tl: TrendlineRow, nowMs: number): number | null {
    const t1 = tl.point1Time.getTime();
    const t2 = tl.point2Time.getTime();
    if (t2 === t1) return null;

    if (tl.drawingType === "horizontal_line") {
      return tl.point1Price;
    }

    const slope = (tl.point2Price - tl.point1Price) / (t2 - t1);

    if (tl.drawingType === "ray" || tl.drawingType === "trendline") {
      return tl.point1Price + slope * (nowMs - t1);
    }

    if (tl.drawingType === "channel") {
      return tl.point1Price + slope * (nowMs - t1);
    }

    return tl.point1Price + slope * (nowMs - t1);
  }

  private async firePriceAlert(alert: PriceAlertRow, triggeredPrice: number): Promise<void> {
    logger.info({ alertId: alert.id, symbol: alert.symbol, triggeredPrice }, "AlertEngine: price alert fired");

    try {
      await db.update(alertsTable)
        .set({ isTriggered: true, triggeredAt: new Date(), triggeredPrice })
        .where(eq(alertsTable.id, alert.id));

      await db.insert(alertEventsTable).values({
        alertId: alert.id, alertType: "price",
        symbol: alert.symbol, condition: alert.condition,
        priceAtTrigger: triggeredPrice, message: alert.message,
      });

      this.wsManager.broadcast({
        type: "alert_triggered",
        alertType: "price",
        alertId: alert.id,
        symbol: alert.symbol,
        condition: alert.condition,
        targetPrice: alert.targetPrice,
        triggeredPrice,
        message: alert.message,
        triggeredAt: new Date().toISOString(),
      });

      if (alert.telegramEnabled) {
        await this.telegram.sendAlertTriggered({
          symbol: alert.symbol,
          condition: alert.condition,
          targetPrice: alert.targetPrice,
          triggeredPrice,
          message: alert.message,
        });
      }
    } catch (err) {
      logger.error({ err, alertId: alert.id }, "AlertEngine: failed to fire price alert");
    }
  }

  private async fireZoneAlert(zone: ZoneRow, triggeredPrice: number, state: ZoneState): Promise<void> {
    // In-memory dedup: prevent same zone firing twice within 10 s
    const lastFired = this.recentlyFired.get(zone.id);
    if (lastFired && Date.now() - lastFired < 10_000) return;
    this.recentlyFired.set(zone.id, Date.now());

    const direction = state === "inside" ? "entered" : state === "above" ? "broke above" : "broke below";
    logger.info({ zoneId: zone.id, symbol: zone.symbol, triggeredPrice, direction }, "AlertEngine: zone alert fired");

    try {
      const cooldownUntil = new Date(Date.now() + COOLDOWN_MS);
      await db.update(zonesTable)
        .set({ isTriggered: true, triggeredAt: new Date(), triggeredPrice, cooldownUntil })
        .where(eq(zonesTable.id, zone.id));

      await db.insert(alertEventsTable).values({
        alertId: zone.id, alertType: "zone",
        symbol: zone.symbol, condition: zone.condition,
        priceAtTrigger: triggeredPrice,
        message: `Price ${direction} ${zone.zoneType.replace("_", " ")} zone [${zone.lowerPrice}–${zone.upperPrice}]`,
      });

      this.wsManager.broadcast({
        type: "alert_triggered",
        alertType: "zone",
        alertId: zone.id,
        symbol: zone.symbol,
        zoneType: zone.zoneType,
        condition: zone.condition,
        upperPrice: zone.upperPrice,
        lowerPrice: zone.lowerPrice,
        triggeredPrice,
        direction,
        triggeredAt: new Date().toISOString(),
      });

      if (zone.telegramEnabled) {
        await this.telegram.sendZoneAlert({
          symbol: zone.symbol,
          zoneType: zone.zoneType,
          condition: zone.condition,
          upperPrice: zone.upperPrice,
          lowerPrice: zone.lowerPrice,
          triggeredPrice,
          direction,
          notes: zone.notes,
        });
      }

      this.activeZones.delete(zone.id);
    } catch (err) {
      logger.error({ err, zoneId: zone.id }, "AlertEngine: failed to fire zone alert");
    }
  }

  private async fireDrawingAlert(
    tl: TrendlineRow,
    triggeredPrice: number,
    projectedPrice: number,
    side: TrendlineSide,
  ): Promise<void> {
    // In-memory dedup: prevent same drawing alert firing twice within 10 s
    const lastFired = this.recentlyFired.get(tl.id);
    if (lastFired && Date.now() - lastFired < 10_000) return;
    this.recentlyFired.set(tl.id, Date.now());

    const direction = side === "above" ? "crossed above" : "crossed below";
    const condLabel = this.humanCondition(tl.condition, side);
    logger.info({ trendlineId: tl.id, symbol: tl.symbol, drawingType: tl.drawingType, triggeredPrice, direction }, "AlertEngine: drawing alert fired");

    try {
      const cooldownUntil = new Date(Date.now() + COOLDOWN_MS);
      await db.update(trendlinesTable)
        .set({
          isTriggered:   true,
          triggeredAt:   new Date(),
          triggeredPrice,
          alertStatus:   "triggered",
          cooldownUntil,
        })
        .where(eq(trendlinesTable.id, tl.id));

      await db.insert(alertEventsTable).values({
        alertId: tl.id, alertType: "trendline",
        symbol: tl.symbol, condition: tl.condition,
        priceAtTrigger: triggeredPrice,
        message: `Price ${direction} ${tl.drawingType} (projected: ${projectedPrice.toFixed(5)})`,
      });

      this.wsManager.broadcast({
        type:          "alert_triggered",
        alertType:     "trendline",
        drawingType:   tl.drawingType,
        alertId:       tl.id,
        symbol:        tl.symbol,
        timeframe:     tl.timeframe,
        condition:     tl.condition,
        conditionLabel: condLabel,
        triggeredPrice,
        projectedPrice,
        direction,
        triggeredAt:   new Date().toISOString(),
      });

      if (tl.telegramEnabled) {
        await this.telegram.sendDrawingAlert({
          symbol:         tl.symbol,
          timeframe:      tl.timeframe,
          drawingType:    tl.drawingType,
          condition:      tl.condition,
          conditionLabel: condLabel,
          triggeredPrice,
          projectedPrice,
          direction,
          notes:          tl.notes,
        });
      }

      this.activeTrendlines.delete(tl.id);
    } catch (err) {
      logger.error({ err, trendlineId: tl.id }, "AlertEngine: failed to fire drawing alert");
    }
  }

  private humanCondition(condition: string, side: TrendlineSide): string {
    const map: Record<string, string> = {
      cross_above: "Cross Above",
      cross_below: "Cross Below",
      breakout:    side === "above" ? "Breakout Above" : "Breakout Below",
      break:       side === "above" ? "Break Above" : "Break Below",
      touch:       "Touch",
      touch_price: "Touch Price",
      above_price: "Above Price",
      below_price: "Below Price",
      enter_zone:  "Enter Zone",
      exit_zone:   "Exit Zone",
      rejection:   "Rejection",
      retest:      "Retest",
    };
    return map[condition] ?? condition;
  }

  getProjectedPrice(trendlineId: number): number | null {
    const tl = this.activeTrendlines.get(trendlineId);
    if (!tl) return null;
    return this.calcTrendlinePrice(tl, Date.now());
  }
}
