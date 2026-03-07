export function getAzureConfig() {
  return {
    key: localStorage.getItem('azure_speech_key') || '',
    region: localStorage.getItem('azure_speech_region') || '',
  };
}

export function setAzureConfig(key, region) {
  localStorage.setItem('azure_speech_key', key);
  localStorage.setItem('azure_speech_region', region);
}

export function hasAzureConfig() {
  return !!(localStorage.getItem('azure_speech_key') && localStorage.getItem('azure_speech_region'));
}
