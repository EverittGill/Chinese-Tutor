import { useState } from 'react';
import { hasAllConfig } from './utils/config';
import SetupScreen from './components/SetupScreen';
import TopicSelector from './components/TopicSelector';
import ConversationScreen from './components/ConversationScreen';
import VocabScreen from './components/VocabScreen';
import Dashboard from './components/Dashboard';
import FlashcardScreen from './components/FlashcardScreen';
import PronunciationScreen from './components/PronunciationScreen';
import SettingsScreen from './components/SettingsScreen';

export default function App() {
  const [configured, setConfigured] = useState(hasAllConfig());
  const [screen, setScreen] = useState('topics');
  const [selectedTopic, setSelectedTopic] = useState(null);

  if (!configured) {
    return <SetupScreen onComplete={() => setConfigured(true)} />;
  }

  if (screen === 'topics') {
    return (
      <TopicSelector
        onSelectTopic={(topic) => {
          setSelectedTopic(topic);
          setScreen('conversation');
        }}
        onNavigate={(dest) => setScreen(dest)}
      />
    );
  }

  if (screen === 'conversation') {
    return (
      <ConversationScreen
        topic={selectedTopic}
        onBack={() => {
          setSelectedTopic(null);
          setScreen('topics');
        }}
      />
    );
  }

  if (screen === 'vocab') {
    return <VocabScreen onBack={() => setScreen('topics')} />;
  }

  if (screen === 'dashboard') {
    return <Dashboard onBack={() => setScreen('topics')} />;
  }

  if (screen === 'flashcards') {
    return <FlashcardScreen onBack={() => setScreen('topics')} />;
  }

  if (screen === 'pronunciation') {
    return <PronunciationScreen onBack={() => setScreen('topics')} />;
  }

  if (screen === 'settings') {
    return <SettingsScreen onBack={() => setScreen('topics')} />;
  }

  return null;
}
