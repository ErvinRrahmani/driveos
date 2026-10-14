function clickLink(href: string, filename: string): void {
  const link = document.createElement('a');
  link.href = href;
  link.rel = 'noopener';
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
}

export function startDownload(url: string): void {
  clickLink(url, '');
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    clickLink(url, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type });
}
