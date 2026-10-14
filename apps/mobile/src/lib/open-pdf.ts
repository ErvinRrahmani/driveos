import { openBrowserAsync } from 'expo-web-browser';
import { Platform } from 'react-native';

function toBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = '';
  for (let index = 0; index < view.length; index += 0x8000) {
    binary += String.fromCharCode(...view.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export async function openPdf(bytes: ArrayBuffer): Promise<void> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    globalThis.open(url, '_blank');
    return;
  }
  await openBrowserAsync(`data:application/pdf;base64,${toBase64(bytes)}`);
}
