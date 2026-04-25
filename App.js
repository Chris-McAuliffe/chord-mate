import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

const STORAGE_KEY = 'CHORD_MATE_SONGS_V1';

const CHORDS = [
  'C', 'C#', 'D', 'D#', 'E', 'F',
  'F#', 'G', 'G#', 'A', 'A#', 'B',
];

const FLAT_EQUIVALENTS = {
  Db: 'C#',
  Eb: 'D#',
  Gb: 'F#',
  Ab: 'G#',
  Bb: 'A#',
};

function splitWordIntoSyllables(word) {
  const clean = word.trim();
  if (!clean) return [];

  const parts = clean.match(/[^aeiouyAEIOUY]*[aeiouyAEIOUY]+(?:[^aeiouyAEIOUY](?![aeiouyAEIOUY]))*/g);

  if (!parts || parts.length === 0) return [clean];

  const joined = parts.join('');
  if (joined.length < clean.length) {
    const remaining = clean.slice(joined.length);
    parts[parts.length - 1] += remaining;
  }

  return parts;
}

function lyricsToEditableLines(lyrics) {
  return lyrics.split('\n').map((line, lineIndex) => {
    const words = line.split(/(\s+)/).filter(Boolean);

    const syllables = words.flatMap((word, wordIndex) => {
      if (/^\s+$/.test(word)) {
        return [{
          id: `${lineIndex}-${wordIndex}-space`,
          text: word,
          isSpace: true,
          chord: '',
        }];
      }

      return splitWordIntoSyllables(word).map((syllable, syllableIndex) => ({
        id: `${lineIndex}-${wordIndex}-${syllableIndex}`,
        text: syllable,
        isSpace: false,
        chord: '',
      }));
    });

    return {
      id: `line-${lineIndex}`,
      syllables,
    };
  });
}

function normaliseChordRoot(root) {
  return FLAT_EQUIVALENTS[root] || root;
}

function transposeChord(chord, steps) {
  if (!chord || !chord.trim()) return chord;

  const trimmed = chord.trim();
  const match = trimmed.match(/^([A-G](?:#|b)?)(.*)$/);
  if (!match) return chord;

  const root = normaliseChordRoot(match[1]);
  const suffix = match[2] || '';
  const index = CHORDS.indexOf(root);

  if (index === -1) return chord;

  const newIndex = (index + steps + CHORDS.length * 100) % CHORDS.length;
  return CHORDS[newIndex] + suffix;
}

export default function App() {
  const [songs, setSongs] = useState([]);
  const [selectedSongId, setSelectedSongId] = useState(null);
  const [title, setTitle] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [lines, setLines] = useState([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedSyllable, setSelectedSyllable] = useState(null);
  const [chordInput, setChordInput] = useState('');
  const [isChordModalVisible, setChordModalVisible] = useState(false);

  useEffect(() => {
    loadSongs();
  }, []);

  const selectedSong = useMemo(
    () => songs.find(song => song.id === selectedSongId),
    [songs, selectedSongId]
  );

  async function loadSongs() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) setSongs(JSON.parse(raw));
    } catch (error) {
      Alert.alert('Error', 'Could not load saved songs.');
    }
  }

  async function persistSongs(nextSongs) {
    setSongs(nextSongs);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextSongs));
  }

  function startNewSong() {
    setSelectedSongId(null);
    setTitle('');
    setLyrics('');
    setLines([]);
    setIsEditMode(false);
  }

  function openSong(song) {
    setSelectedSongId(song.id);
    setTitle(song.title);
    setLyrics(song.lyrics);
    setLines(song.lines);
    setIsEditMode(false);
  }

  function enterEditMode() {
    if (!lyrics.trim()) {
      Alert.alert('Lyrics needed', 'Enter lyrics before using edit mode.');
      return;
    }

    if (lines.length === 0) {
      setLines(lyricsToEditableLines(lyrics));
    }

    setIsEditMode(true);
  }

  function openChordEditor(lineIndex, syllableIndex, syllable) {
    if (syllable.isSpace) return;

    setSelectedSyllable({ lineIndex, syllableIndex });
    setChordInput(syllable.chord || '');
    setChordModalVisible(true);
  }

  function saveChord() {
    if (!selectedSyllable) return;

    const nextLines = lines.map((line, lineIndex) => {
      if (lineIndex !== selectedSyllable.lineIndex) return line;

      return {
        ...line,
        syllables: line.syllables.map((syllable, syllableIndex) => {
          if (syllableIndex !== selectedSyllable.syllableIndex) return syllable;
          return { ...syllable, chord: chordInput.trim() };
        }),
      };
    });

    setLines(nextLines);
    setChordModalVisible(false);
    setSelectedSyllable(null);
    setChordInput('');
  }

  async function saveSong() {
    if (!title.trim()) {
      Alert.alert('Title needed', 'Give the song a title before saving.');
      return;
    }

    const song = {
      id: selectedSongId || Date.now().toString(),
      title: title.trim(),
      lyrics,
      lines: lines.length > 0 ? lines : lyricsToEditableLines(lyrics),
      updatedAt: new Date().toISOString(),
    };

    const nextSongs = selectedSongId
      ? songs.map(existing => existing.id === selectedSongId ? song : existing)
      : [song, ...songs];

    await persistSongs(nextSongs);
    setSelectedSongId(song.id);
    setLines(song.lines);
    setIsEditMode(false);
    Alert.alert('Saved', 'Song saved on this phone.');
  }

  function transposeAll(steps) {
    const nextLines = lines.map(line => ({
      ...line,
      syllables: line.syllables.map(syllable => ({
        ...syllable,
        chord: transposeChord(syllable.chord, steps),
      })),
    }));

    setLines(nextLines);
  }

  async function deleteSong(songId) {
    const nextSongs = songs.filter(song => song.id !== songId);
    await persistSongs(nextSongs);
    if (selectedSongId === songId) startNewSong();
  }

  async function exportCurrentSong() {
    if (!title.trim()) {
      Alert.alert('Nothing to export', 'Save or title the song before exporting.');
      return;
    }

    const songToExport = {
      id: selectedSongId || Date.now().toString(),
      title: title.trim(),
      lyrics,
      lines: lines.length > 0 ? lines : lyricsToEditableLines(lyrics),
      updatedAt: new Date().toISOString(),
      appFormat: 'ChordMateSongV1',
    };

    try {
      const safeTitle = songToExport.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const fileUri = `${FileSystem.documentDirectory}${safeTitle || 'song'}_chords.json`;

      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(songToExport, null, 2));

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Exported', `File saved here: ${fileUri}`);
        return;
      }

      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: 'Share chord lyrics file',
        UTI: 'public.json',
      });
    } catch (error) {
      Alert.alert('Export failed', 'The song could not be exported.');
    }
  }

  async function importSongFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      const fileContents = await FileSystem.readAsStringAsync(asset.uri);
      const importedSong = JSON.parse(fileContents);

      if (importedSong.appFormat !== 'ChordMateSongV1' || !importedSong.title || !importedSong.lines) {
        Alert.alert('Invalid file', 'This does not look like a Chord Mate song file.');
        return;
      }

      const songToSave = {
        ...importedSong,
        id: Date.now().toString(),
        updatedAt: new Date().toISOString(),
      };

      const nextSongs = [songToSave, ...songs];
      await persistSongs(nextSongs);
      openSong(songToSave);
      Alert.alert('Imported', 'Song imported successfully.');
    } catch (error) {
      Alert.alert('Import failed', 'The file could not be imported.');
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.appTitle}>Chord Mate</Text>
      </View>

      <ScrollView style={styles.editor}>
        <Text style={styles.label}>Song title</Text>
        <TextInput
          style={styles.titleInput}
          placeholder="e.g. Jerusalem"
          value={title}
          onChangeText={setTitle}
        />

        {!isEditMode && lines.length === 0 && (
          <>
            <Text style={styles.label}>Lyrics</Text>
            <TextInput
              style={styles.lyricsInput}
              placeholder="Paste or type lyrics here..."
              value={lyrics}
              onChangeText={setLyrics}
              multiline
              textAlignVertical="top"
            />
          </>
        )}

        {lines.length > 0 && (
          <View style={styles.songDisplay}>
            {lines.map((line, lineIndex) => (
              <View key={line.id} style={styles.line}>
                {line.syllables.map((syllable, syllableIndex) => {
                  if (syllable.isSpace) {
                    return <Text key={syllable.id}> </Text>;
                  }

                  return (
                    <Pressable
                      key={syllable.id}
                      style={styles.syllableBlock}
                      onPress={() => isEditMode && openChordEditor(lineIndex, syllableIndex, syllable)}
                    >
                      <Text style={styles.chordText}>{syllable.chord || ' '}</Text>
                      <Text style={[styles.lyricText, isEditMode && styles.editableSyllable]}>
                        {syllable.text}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        )}

        <View style={styles.primaryActionPanel}>
          <Button title="New song" onPress={startNewSong} />
          <Button title="Edit mode" onPress={enterEditMode} />
          <Button title="Save" onPress={saveSong} />
        </View>

        <View style={styles.fileActionPanel}>
          <Text style={styles.label}>Share or receive songs</Text>
          <View style={styles.buttonRow}>
            <Button title="Download / Share" onPress={exportCurrentSong} />
            <Button title="Upload / Import" onPress={importSongFile} />
          </View>
        </View>

        <View style={styles.transposePanel}>
          <Text style={styles.label}>Transpose</Text>
          <View style={styles.buttonRow}>
            <Button title="Down" onPress={() => transposeAll(-1)} />
            <Button title="Up" onPress={() => transposeAll(1)} />
          </View>
        </View>

        <Text style={styles.savedTitle}>Saved songs</Text>
        <FlatList
          data={songs}
          keyExtractor={item => item.id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <View style={styles.savedSongRow}>
              <Pressable style={styles.savedSongButton} onPress={() => openSong(item)}>
                <Text style={styles.savedSongText}>{item.title}</Text>
                <Text style={styles.savedSongDate}>Updated {new Date(item.updatedAt).toLocaleDateString()}</Text>
              </Pressable>
              <Button title="Delete" onPress={() => deleteSong(item.id)} />
            </View>
          )}
        />
      </ScrollView>

      <Modal visible={isChordModalVisible} transparent animationType="fade">
        <View style={styles.modalBackground}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enter chord</Text>
            <TextInput
              style={styles.chordInput}
              placeholder="e.g. G, Am, D7, Bb"
              value={chordInput}
              onChangeText={setChordInput}
              autoCapitalize="characters"
            />
            <View style={styles.buttonRow}>
              <Button title="Cancel" onPress={() => setChordModalVisible(false)} />
              <Button title="Apply" onPress={saveChord} />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f7f7',
  },
  header: {
    paddingTop: 24,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  appTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  editor: {
    padding: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
  },
  titleInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  lyricsInput: {
    minHeight: 180,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  songDisplay: {
    backgroundColor: '#ffffff',
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  line: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  syllableBlock: {
    alignItems: 'center',
    marginRight: 1,
    marginBottom: 4,
    minWidth: 16,
  },
  chordText: {
    fontSize: 14,
    fontWeight: '700',
    minHeight: 18,
    color: '#1d4ed8',
  },
  lyricText: {
    fontSize: 18,
    color: '#111827',
  },
  editableSyllable: {
    backgroundColor: '#fff7cc',
    borderRadius: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 10,
    marginTop: 14,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  primaryActionPanel: {
    marginTop: 18,
    backgroundColor: '#ffffff',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    gap: 10,
  },
  fileActionPanel: {
    marginTop: 12,
    backgroundColor: '#ffffff',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  transposePanel: {
    marginTop: 8,
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  savedTitle: {
    marginTop: 24,
    marginBottom: 8,
    fontSize: 18,
    fontWeight: '700',
  },
  savedSongRow: {
    backgroundColor: '#ffffff',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  savedSongButton: {
    flex: 1,
  },
  savedSongText: {
    fontSize: 16,
    fontWeight: '600',
  },
  savedSongDate: {
    fontSize: 12,
    color: '#666',
  },
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  chordInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
  },
});
