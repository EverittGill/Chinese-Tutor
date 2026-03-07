import { useState } from 'react';
import { hasAzureConfig } from './utils/config';
import SetupScreen from './components/SetupScreen';
import TopicSelector from './components/TopicSelector';
import ConversationScreen from './components/ConversationScreen';

export default function App() {
  const [configured, setConfigured] = useState(hasAzureConfig());
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

  return null;
}
