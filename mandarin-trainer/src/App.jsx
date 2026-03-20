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
import CreditModal from './components/CreditModal';

function AppContent() {
  const { user, loading, credits, creditError, setCreditError } = useAuth();
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

  // Show promo code screen if user has no credits (initial state, not mid-session)
  if (credits !== null && credits <= 0 && !creditError) {
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

  const handleCreditDismiss = () => {
    setCreditError(false);
    setSelectedTopic(null);
    setScreen('topics');
  };

  let content = null;

  if (screen === 'topics') {
    content = (
      <TopicSelector
        onSelectTopic={(topic) => {
          setSelectedTopic(topic);
          setScreen('conversation');
        }}
        onNavigate={(dest) => setScreen(dest)}
      />
    );
  } else if (screen === 'conversation') {
    content = (
      <ConversationScreen
        topic={selectedTopic}
        onBack={() => {
          setSelectedTopic(null);
          setScreen('topics');
        }}
      />
    );
  } else if (screen === 'vocab') {
    content = <VocabScreen onBack={() => setScreen('topics')} />;
  } else if (screen === 'dashboard') {
    content = <Dashboard onBack={() => setScreen('topics')} />;
  } else if (screen === 'flashcards') {
    content = <FlashcardScreen onBack={() => setScreen('topics')} />;
  } else if (screen === 'pronunciation') {
    content = <PronunciationScreen onBack={() => setScreen('topics')} />;
  } else if (screen === 'settings') {
    content = <SettingsScreen onBack={() => setScreen('topics')} />;
  }

  return (
    <>
      {content}
      {creditError && <CreditModal onDismiss={handleCreditDismiss} />}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
