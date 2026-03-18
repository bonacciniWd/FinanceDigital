/**
 * @module useAudioRecorder
 * @description Hook para gravar áudio via MediaRecorder API.
 * Retorna blob do áudio gravado + controles start/stop/cancel.
 */
import { useState, useRef, useCallback } from 'react';

interface AudioRecorderState {
  isRecording: boolean;
  duration: number;
  blob: Blob | null;
}

export function useAudioRecorder() {
  const [state, setState] = useState<AudioRecorderState>({
    isRecording: false,
    duration: 0,
    blob: null,
  });

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorder.current = recorder;
      chunks.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks.current, { type: 'audio/webm' });
        setState((s) => ({ ...s, isRecording: false, blob }));
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
      };

      recorder.start(250);
      startTimeRef.current = Date.now();
      setState({ isRecording: true, duration: 0, blob: null });

      timerRef.current = setInterval(() => {
        setState((s) => ({
          ...s,
          duration: Math.floor((Date.now() - startTimeRef.current) / 1000),
        }));
      }, 500);
    } catch (err) {
      console.error('Erro ao acessar microfone:', err);
    }
  }, []);

  const stop = useCallback(() => {
    if (mediaRecorder.current?.state === 'recording') {
      mediaRecorder.current.stop();
    }
  }, []);

  const cancel = useCallback(() => {
    if (mediaRecorder.current?.state === 'recording') {
      mediaRecorder.current.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setState({ isRecording: false, duration: 0, blob: null });
  }, []);

  const clear = useCallback(() => {
    setState((s) => ({ ...s, blob: null, duration: 0 }));
  }, []);

  return { ...state, start, stop, cancel, clear };
}
