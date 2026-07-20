/**
 * app/(tabs)/notebook.tsx — Notebook Screen
 *
 * React Native port of artifacts/trading-journal/src/pages/notebook.tsx
 *
 * Web → RN replacements:
 *   div / span / button     → View / Text / Pressable
 *   input                   → TextInput
 *   textarea                → TextInput (multiline + scrollEnabled)
 *   CSS className            → StyleSheet.create()
 *   Framer Motion /
 *     AnimatePresence        → no animation library (tablet pattern)
 *   PageTransition /
 *     AnimatedButton /
 *     AnimatedCard /
 *     AnimatedIconButton     → View / Pressable (no wrapper needed)
 *   Card (shadcn)            → View with glass-style background
 *   Input (shadcn)           → TextInput
 *   Textarea (shadcn)        → TextInput (multiline)
 *   lucide-react icons       → @expo/vector-icons Ionicons
 *   e.target.value           → onChangeText callback
 *
 * All business logic preserved exactly:
 *   - selectedNoteId / searchQuery state
 *   - useListNotes / useCreateNote / useUpdateNote / useDeleteNote
 *   - queryClient.invalidateQueries on create / update / delete success
 *   - filteredNotes — title + content text search (case-insensitive)
 *   - selectedNote — derived via Array.find
 *   - Auto-save — 1 000 ms debounce; fires only when title or content
 *                 differs from lastSaved ref (avoids no-op network calls)
 *   - initializedForId ref guard — prevents re-initializing editor fields
 *                                  when the note list re-renders
 *   - lastSaved ref — compared before auto-save; updated on success
 *   - mutateFnRef  — stable ref to updateNote.mutate so the setTimeout
 *                    closure always calls the current function
 *   - handleCreate — mutates { title: "New Note", content: "" } and
 *                    selects the returned note id on success
 *   - handleDelete — mutates by id; clears selectedNoteId on success
 *   - Empty state  — shown in editor pane when no note is selected
 *   - Loading state — skeleton note rows while notes are fetching
 */

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  memo,
} from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListNotes,
  useCreateNote,
  useUpdateNote,
  useDeleteNote,
  getListNotesQueryKey,
  type Note,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens — consistent with project dark theme
// ─────────────────────────────────────────────────────────────────────────────

const BG_PAGE   = "#05070A";
const BG_PANEL  = "rgba(12,14,19,0.97)";
const BG_ACTIVE = "rgba(255,255,255,0.08)";
const BORDER    = "rgba(255,255,255,0.08)";
const TEXT_PRI  = "#EDF0F6";
const TEXT_MUT  = "rgba(148,163,184,0.60)";
const TEXT_DIM  = "rgba(148,163,184,0.40)";
const PRIMARY   = "#7C3AED";
const DANGER    = "#ef4444";

// ─────────────────────────────────────────────────────────────────────────────
// NoteRow — sidebar list item (memoized to avoid re-renders on other notes)
// ─────────────────────────────────────────────────────────────────────────────

interface NoteRowProps {
  note:       Note;
  isSelected: boolean;
  onSelect:   (id: number) => void;
}

const NoteRow = memo(function NoteRow({ note, isSelected, onSelect }: NoteRowProps) {
  return (
    <Pressable
      onPress={() => onSelect(note.id)}
      style={({ pressed }) => [
        rowStyles.container,
        isSelected && rowStyles.selected,
        pressed && !isSelected && rowStyles.pressed,
      ]}
    >
      <Text style={[rowStyles.title, isSelected && rowStyles.titleActive]} numberOfLines={1}>
        {note.title || "Untitled"}
      </Text>
      <Text style={rowStyles.date} numberOfLines={1}>
        {new Date(note.updatedAt).toLocaleDateString()}
      </Text>
    </Pressable>
  );
});

const rowStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical:   10,
    borderRadius:      8,
    marginHorizontal:  4,
    marginVertical:    2,
  },
  selected: {
    backgroundColor: BG_ACTIVE,
  },
  pressed: {
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  title: {
    fontSize:   14,
    fontWeight: "500",
    fontFamily: "Inter_500Medium",
    color:      TEXT_MUT,
  },
  titleActive: {
    color:      TEXT_PRI,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  date: {
    fontSize:   11,
    color:      TEXT_DIM,
    fontFamily: "Inter_400Regular",
    marginTop:  3,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// SkeletonNoteRows — shown while notes are loading
// ─────────────────────────────────────────────────────────────────────────────

function SkeletonNoteRows() {
  return (
    <View style={{ paddingHorizontal: 8, paddingTop: 4 }}>
      {[120, 90, 110, 80, 100].map((w, i) => (
        <View key={i} style={skelStyles.row}>
          <Skeleton style={[skelStyles.title, { width: `${w - 20}%` as any }]} />
          <Skeleton style={skelStyles.date} />
        </View>
      ))}
    </View>
  );
}

const skelStyles = StyleSheet.create({
  row: {
    paddingHorizontal: 12,
    paddingVertical:   10,
    marginVertical:    2,
    gap:               6,
  },
  title: { height: 14, borderRadius: 4 },
  date:  { height: 11, width: "40%", borderRadius: 3 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────

export default function NotebookScreen() {
  const insets      = useSafeAreaInsets();
  const queryClient = useQueryClient();

  // ── Core state (mirrors web exactly) ──────────────────────────────────────
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [searchQuery,    setSearchQuery]    = useState("");

  // ── API hooks (mirrors web exactly) ───────────────────────────────────────
  const { data: notes, isLoading } = useListNotes();

  const createNote = useCreateNote({
    mutation: {
      onSuccess: (newNote: Note) => {
        queryClient.invalidateQueries({ queryKey: getListNotesQueryKey() });
        setSelectedNoteId(newNote.id);
      },
    },
  });

  const deleteNote = useDeleteNote({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListNotesQueryKey() });
        setSelectedNoteId(null);
      },
    },
  });

  const updateNote = useUpdateNote();

  // ── Create handler (mirrors web exactly) ──────────────────────────────────
  const handleCreate = useCallback(() => {
    createNote.mutate({ data: { title: "New Note", content: "" } });
  }, [createNote]);

  // ── Filtered notes (mirrors web exactly) ──────────────────────────────────
  const filteredNotes = notes?.filter((n: Note) =>
    n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    n.content.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // ── Selected note (mirrors web exactly) ───────────────────────────────────
  const selectedNote = notes?.find((n: Note) => n.id === selectedNoteId);

  // ── Auto-save state (mirrors web exactly) ─────────────────────────────────
  const [title,   setTitle]   = useState("");
  const [content, setContent] = useState("");

  // Refs that mirror the web implementation exactly
  const initializedForId = useRef<number | null>(null);
  const lastSaved        = useRef({ title: "", content: "" });
  const mutateFnRef      = useRef(updateNote.mutate);
  mutateFnRef.current    = updateNote.mutate;

  // Initialize editor fields when a different note is selected (mirrors web exactly)
  useEffect(() => {
    if (selectedNote && initializedForId.current !== selectedNote.id) {
      initializedForId.current = selectedNote.id;
      setTitle(selectedNote.title);
      setContent(selectedNote.content);
      lastSaved.current = { title: selectedNote.title, content: selectedNote.content };
    }
  }, [selectedNote]);

  // Auto-save with 1 000 ms debounce (mirrors web exactly)
  useEffect(() => {
    if (!selectedNoteId || initializedForId.current !== selectedNoteId) return;

    const timer = setTimeout(() => {
      if (
        title   !== lastSaved.current.title ||
        content !== lastSaved.current.content
      ) {
        mutateFnRef.current(
          { id: selectedNoteId, data: { title, content } },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: getListNotesQueryKey() });
              lastSaved.current = { title, content };
            },
          },
        );
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [title, content, selectedNoteId, queryClient]);

  // ── Delete handler — RN uses Alert.alert instead of implicit click
  //    (no browser confirm(); Alert.alert is the RN equivalent) ──────────────
  const handleDelete = useCallback(() => {
    if (!selectedNote) return;
    Alert.alert(
      "Delete Note",
      `Delete "${selectedNote.title || "Untitled"}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text:    "Delete",
          style:   "destructive",
          onPress: () => deleteNote.mutate({ id: selectedNote.id }),
        },
      ],
    );
  }, [selectedNote, deleteNote]);

  // ── FlatList key extractor ────────────────────────────────────────────────
  const keyExtractor = useCallback((item: Note) => String(item.id), []);

  const renderNote = useCallback(
    ({ item }: { item: Note }) => (
      <NoteRow
        note={item}
        isSelected={item.id === selectedNoteId}
        onSelect={setSelectedNoteId}
      />
    ),
    [selectedNoteId],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <View style={styles.sidebar}>

          {/* Sidebar header: New Note button + Search */}
          <View style={styles.sidebarHeader}>
            <Pressable
              onPress={handleCreate}
              disabled={createNote.isPending}
              style={({ pressed }) => [
                styles.newBtn,
                pressed && styles.newBtnPressed,
                createNote.isPending && styles.newBtnDisabled,
              ]}
            >
              {createNote.isPending ? (
                <ActivityIndicator size={14} color="#fff" />
              ) : (
                <Ionicons name="add" size={16} color="#fff" />
              )}
              <Text style={styles.newBtnText}>New Note</Text>
            </Pressable>

            {/* Search input */}
            <View style={styles.searchRow}>
              <Ionicons name="search-outline" size={15} color={TEXT_MUT} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search notes..."
                placeholderTextColor={TEXT_DIM}
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
                clearButtonMode="while-editing"
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>
          </View>

          {/* Note list */}
          <View style={styles.sidebarList}>
            {isLoading ? (
              <SkeletonNoteRows />
            ) : (
              <FlatList
                data={filteredNotes ?? []}
                keyExtractor={keyExtractor}
                renderItem={renderNote}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <View style={styles.listEmpty}>
                    <Text style={styles.listEmptyText}>
                      {searchQuery ? "No matching notes" : "No notes yet"}
                    </Text>
                  </View>
                }
              />
            )}
          </View>
        </View>

        {/* ── Divider ─────────────────────────────────────────────────────── */}
        <View style={styles.divider} />

        {/* ── Editor pane ─────────────────────────────────────────────────── */}
        <View style={styles.editor}>
          {selectedNote ? (
            // ── Active editor ───────────────────────────────────────────────
            <View style={styles.editorInner}>

              {/* Editor header: title + delete */}
              <View style={styles.editorHeader}>
                <TextInput
                  style={styles.titleInput}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Note Title"
                  placeholderTextColor={TEXT_DIM}
                  returnKeyType="done"
                  blurOnSubmit
                />
                <Pressable
                  onPress={handleDelete}
                  disabled={deleteNote.isPending}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.deleteBtn,
                    pressed && styles.deleteBtnPressed,
                  ]}
                >
                  {deleteNote.isPending ? (
                    <ActivityIndicator size={14} color={DANGER} />
                  ) : (
                    <Ionicons name="trash-outline" size={17} color={DANGER} />
                  )}
                </Pressable>
              </View>

              {/* Content textarea */}
              <TextInput
                style={styles.contentInput}
                value={content}
                onChangeText={setContent}
                placeholder="Start typing your journal entry..."
                placeholderTextColor={TEXT_DIM}
                multiline
                scrollEnabled
                textAlignVertical="top"
              />
            </View>
          ) : (
            // ── Empty state (mirrors web exactly) ───────────────────────────
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="add" size={32} color={TEXT_DIM} />
              </View>
              <Text style={styles.emptyText}>Select a note or create a new one</Text>
            </View>
          )}
        </View>

      </View>
    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const SIDEBAR_W = 280;

const styles = StyleSheet.create({
  // ── Root ──────────────────────────────────────────────────────────────────
  root: {
    flex:            1,
    flexDirection:   "row",
    backgroundColor: BG_PAGE,
  },

  // ── Sidebar ───────────────────────────────────────────────────────────────
  sidebar: {
    width:           SIDEBAR_W,
    backgroundColor: BG_PANEL,
    flexDirection:   "column",
  },
  sidebarHeader: {
    padding:      12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap:          10,
  },

  // New Note button (mirrors web: bg-primary, w-full, h-9)
  newBtn: {
    flexDirection:   "row",
    alignItems:      "center",
    justifyContent:  "center",
    backgroundColor: PRIMARY,
    borderRadius:    8,
    paddingVertical: 9,
    gap:             6,
  },
  newBtnPressed: {
    backgroundColor: "rgba(124,58,237,0.85)",
  },
  newBtnDisabled: {
    opacity: 0.6,
  },
  newBtnText: {
    color:      "#fff",
    fontSize:   13,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },

  // Search row
  searchRow: {
    flexDirection:    "row",
    alignItems:       "center",
    backgroundColor:  "rgba(255,255,255,0.05)",
    borderRadius:     8,
    borderWidth:      1,
    borderColor:      BORDER,
    paddingHorizontal: 10,
    height:           36,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex:        1,
    color:       TEXT_PRI,
    fontSize:    13,
    fontFamily:  "Inter_400Regular",
    paddingVertical: 0,
  },

  // Note list
  sidebarList: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 4,
  },
  listEmpty: {
    paddingTop:     48,
    alignItems:     "center",
  },
  listEmptyText: {
    color:      TEXT_DIM,
    fontSize:   13,
    fontFamily: "Inter_400Regular",
  },

  // ── Divider ───────────────────────────────────────────────────────────────
  divider: {
    width:           1,
    backgroundColor: BORDER,
  },

  // ── Editor ────────────────────────────────────────────────────────────────
  editor: {
    flex:            1,
    backgroundColor: BG_PAGE,
  },
  editorInner: {
    flex:          1,
    flexDirection: "column",
  },

  // Editor header
  editorHeader: {
    flexDirection:     "row",
    alignItems:        "center",
    paddingHorizontal: 20,
    paddingVertical:   14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap:               8,
  },
  titleInput: {
    flex:       1,
    color:      TEXT_PRI,
    fontSize:   20,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    paddingVertical: 0,
  },
  deleteBtn: {
    width:           36,
    height:          36,
    alignItems:      "center",
    justifyContent:  "center",
    borderRadius:    8,
  },
  deleteBtnPressed: {
    backgroundColor: "rgba(239,68,68,0.10)",
  },

  // Content textarea
  contentInput: {
    flex:              1,
    color:             TEXT_PRI,
    fontSize:          15,
    fontFamily:        "Inter_400Regular",
    lineHeight:        24,
    paddingHorizontal: 20,
    paddingTop:        16,
    paddingBottom:     16,
  },

  // ── Empty state (mirrors web: centered icon + text) ───────────────────────
  emptyState: {
    flex:           1,
    alignItems:     "center",
    justifyContent: "center",
    gap:            16,
  },
  emptyIcon: {
    width:           64,
    height:          64,
    borderRadius:    32,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems:      "center",
    justifyContent:  "center",
  },
  emptyText: {
    color:      TEXT_MUT,
    fontSize:   14,
    fontFamily: "Inter_400Regular",
  },
});
