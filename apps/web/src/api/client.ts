import type { ApiErrorBody, DocumentDTO } from '@pdf-analyzer/shared';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: ApiErrorBody['details']
  ) {
    super(message);
  }
}

export async function toApiError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  return new ApiError(res.status, body?.error ?? `Request failed (${res.status})`, body?.code, body?.details);
}

type Init = Omit<RequestInit, 'body'> & { json?: unknown };

export async function api<T>(path: string, { json, headers, ...init }: Init = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers: json === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
    body: json === undefined ? undefined : JSON.stringify(json)
  });
  if (!res.ok) throw await toApiError(res);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Uses XHR instead of fetch because fetch can't report upload progress. */
export function uploadDocument(file: File, onProgress: (fraction: number) => void): Promise<DocumentDTO> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/documents');
    xhr.withCredentials = true;
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve(xhr.response as DocumentDTO);
      const body = xhr.response as ApiErrorBody | null;
      reject(new ApiError(xhr.status, body?.error ?? `Upload failed (${xhr.status})`, body?.code));
    };
    xhr.onerror = () => reject(new ApiError(0, 'Network error. Check your connection and try again.'));
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}
