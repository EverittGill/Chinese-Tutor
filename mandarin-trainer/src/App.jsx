import { useState } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import useAuth from './hooks/useAuth';
import AuthScreen from './components/AuthScreen';
import PromoCodeScreen from './components/PromoCodeScreen';
import TopicSelector from './components/TopicSelector';
import ConversationScreen from './components/ConversationScreen';
import VocabScreen from './components/VocabScreen';
import Dashboard from './components/Dashboard';
import FlashcardScreen from './components/FlashcardScreen';
import PronunciationScreen from './components/PronunciationScreen';
import SettingsScreen from './components/SettingsScreen';

function AppContent() {
  const { user, loading, credits } = useAuth();
  console.log('[AppContent] loading:', loading, 'user:', !!user, 'credits:', credits);
  const [screen, setScreen] = useState('topics');
  const [selectedTopic, setSelectedTopic] = useState(null);

  if (loading) {
    return (
      <div className="min-h-dvh bg-warm-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  // Show promo code screen if user has no credits
  if (credits !== null && credits <= 0) {
    return <PromoCodeScreen />;
  }

  // Credits still loading
  if (credits === null) {
    return (
      <div className="min-h-dvh bg-warm-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
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

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
