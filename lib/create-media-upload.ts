export async function uploadUserMedia(file: File, purpose?: string): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  if (purpose) fd.append("purpose", purpose);
  const response = await fetch("/api/upload", { method: "POST", body: fd });
  const data = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!response.ok) {
    throw new Error(data?.error ?? "Upload failed.");
  }
  if (!data?.url) {
    throw new Error("Upload failed.");
  }
  return data.url;
}
