import { useQueryClient } from '@tanstack/react-query';
import { FileUp, Loader2 } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB, type DocumentDTO } from '@pdf-analyzer/shared';
import { uploadDocument } from '@/api/client';
import { keys } from '@/api/queries';
import { cn } from '@/lib/utils';

export function UploadDropzone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const qc = useQueryClient();

  async function upload(file: File) {
    // Same limits as the server, checked up front to save a pointless upload.
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return toast.error(`${file.name} is not a PDF`);
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return toast.error(`${file.name} is larger than ${MAX_FILE_SIZE_MB} MB`);
    }

    setProgress(0);
    try {
      const doc = await uploadDocument(file, setProgress);
      qc.setQueryData<DocumentDTO[]>(keys.documents, (old = []) => [doc, ...old]);
      toast.success(`${doc.name} uploaded`, { description: 'Indexing it now. This usually takes a few seconds.' });
    } catch (err) {
      toast.error(`Couldn't upload ${file.name}`, { description: (err as Error).message, duration: 8000 });
    } finally {
      setProgress(null);
      qc.invalidateQueries({ queryKey: keys.documents });
    }
  }

  async function handleFiles(files: FileList | null) {
    for (const file of Array.from(files ?? [])) await upload(file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  const busy = progress !== null;

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/25 bg-card/80 p-10 text-center backdrop-blur transition-colors',
          'hover:border-primary/50 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          dragging && 'border-primary bg-primary/5',
          busy && 'cursor-wait'
        )}
      >
        {busy ? (
          <>
            <Loader2 className="size-7 animate-spin text-muted-foreground" />
            <span className="text-sm font-medium">
              {progress < 1 ? `Uploading… ${Math.round(progress * 100)}%` : 'Extracting text…'}
            </span>
            <div className="h-1.5 w-48 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress * 100}%` }} />
            </div>
          </>
        ) : (
          <>
            <FileUp className="size-8 text-primary" strokeWidth={1.5} />
            <span className="font-serif text-lg font-medium">Drop PDFs here or click to upload</span>
            <span className="text-xs text-muted-foreground">
              Text-based PDFs up to {MAX_FILE_SIZE_MB} MB. Scanned documents aren't supported.
            </span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        data-testid="file-input"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </>
  );
}
