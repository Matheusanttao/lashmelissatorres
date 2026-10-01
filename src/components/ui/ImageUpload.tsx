import { useState, type DragEvent } from 'react';
import { ImagePlus, Trash2, RefreshCw } from 'lucide-react';
import { Button } from './Button';
import { Spinner } from './Feedback';
import { useToast } from './Toast';
import { uploadPublicImage, validateImage } from '@/lib/storage';

interface Props {
  value: string | null;
  onChange: (url: string | null, path: string | null) => void;
  folder: string;
  label?: string;
  hint?: string;
  aspect?: string;
  /** Envio personalizado (ex.: bucket privado). */
  uploader?: (file: File) => Promise<{ url: string; path: string }>;
}

/** Campo de imagem: arrastar/soltar ou tocar para escolher, com prévia. */
export function ImageUpload({ value, onChange, folder, label, hint, aspect = '4 / 3', uploader }: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  async function handle(file?: File | null) {
    if (!file) return;
    const invalid = validateImage(file);
    if (invalid) return toast.error(invalid);
    setBusy(true);
    try {
      const res = uploader ? await uploader(file) : await uploadPublicImage(file, folder);
      onChange(res.url, res.path);
    } catch (e) {
      toast.error(e, 'Não foi possível enviar a imagem.');
    } finally {
      setBusy(false);
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    handle(e.dataTransfer.files?.[0]);
  };

  return (
    <div className="field">
      {label && <span className="field-label">{label}</span>}
      {value ? (
        <div className="upload-preview" style={{ aspectRatio: aspect }}>
          <img src={value} alt="" />
          <div className="upload-actions">
            <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
              <RefreshCw /> Trocar
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  handle(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
            <Button variant="danger-soft" size="sm" icon={<Trash2 />} onClick={() => onChange(null, null)}>
              Remover
            </Button>
          </div>
          {busy && (
            <div className="upload-busy">
              <Spinner label="Enviando imagem" />
            </div>
          )}
        </div>
      ) : (
        <label
          className={`upload ${drag ? 'drag' : ''}`}
          style={{ aspectRatio: aspect }}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
        >
          {busy ? (
            <Spinner label="Enviando imagem" />
          ) : (
            <>
              <ImagePlus aria-hidden />
              <strong>Escolher foto</strong>
              <span>Toque para selecionar ou arraste aqui · JPG, PNG ou WEBP</span>
            </>
          )}
          <input
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={(e) => {
              handle(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
      )}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}
