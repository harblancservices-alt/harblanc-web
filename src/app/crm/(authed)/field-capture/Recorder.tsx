"use client";

import { useEffect, useRef, useState } from "react";
import { IconFieldCapture } from "../_shell/icons";

/**
 * Minimal ambient typing for the Web Speech API — not in TS's DOM lib, and
 * support is inconsistent enough (prefixed on Chrome/Android, absent on iOS
 * Safari) that this must be feature-detected rather than assumed.
 */
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

/**
 * In-app record button using the Web Speech API. Appends each finalized
 * chunk of recognized speech to the parent's transcript via `onAppend` —
 * the parent owns the actual textarea value, so this component never touches
 * it directly. Feature-detects on mount and renders nothing when unsupported
 * (notably iOS Safari), leaving the textarea's native keyboard-mic hint as
 * the fallback dictation path everywhere.
 */
export function Recorder({ onAppend }: { onAppend: (text: string) => void }) {
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSupported(!!Ctor);
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  function start() {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let finalChunk = "";
      let interimChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const piece = result[0]?.transcript ?? "";
        if (result.isFinal) finalChunk += piece;
        else interimChunk += piece;
      }
      if (finalChunk.trim()) onAppend(finalChunk.trim());
      setInterim(interimChunk);
    };
    recognition.onerror = () => {
      setRecording(false);
      setInterim("");
    };
    recognition.onend = () => {
      setRecording(false);
      setInterim("");
    };

    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
  }

  function stop() {
    recognitionRef.current?.stop();
    setRecording(false);
    setInterim("");
  }

  if (!supported) return null;

  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        onClick={recording ? stop : start}
        className={[
          "inline-flex h-11 items-center gap-2 rounded-lg px-4 text-[13.5px] font-semibold transition-colors",
          recording
            ? "bg-bad text-white hover:bg-bad/90"
            : "bg-accent text-white hover:bg-accent-hover",
        ].join(" ")}
      >
        <IconFieldCapture width={17} height={17} />
        {recording ? "Stop recording" : "Record"}
      </button>
      {recording && (
        <span className="text-[12.5px] text-fg-subtle">
          {interim ? `Listening… "${interim}"` : "Listening…"}
        </span>
      )}
    </div>
  );
}
