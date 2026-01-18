import { useEffect } from 'react';

type DocumentMeta = {
  title: string;
  description?: string;
};

export function useDocumentMeta({ title, description }: DocumentMeta) {
  useEffect(() => {
    document.title = title;
    if (!description) {
      return;
    }
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute('content', description);
    }
  }, [title, description]);
}
