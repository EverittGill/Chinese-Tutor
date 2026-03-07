import { useState } from 'react';
import { hasAzureConfig } from './utils/config';
import SetupScreen from './components/SetupScreen';
import ConversationScreen from './components/ConversationScreen';

export default function App() {
  const [configured, setConfigured] = useState(hasAzureConfig());

  if (!configured) {
    return <SetupScreen onComplete={() => setConfigured(true)} />;
  }

  return <ConversationScreen />;
}
