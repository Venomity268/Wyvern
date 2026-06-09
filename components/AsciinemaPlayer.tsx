"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import { Terminal, useTerminal } from "@wterm/react";
import "@wterm/react/css";
import { Play, Pause, RotateCcw } from "lucide-react";
import { createGhosttyCore } from "@/lib/ghostty/shared-core";

interface AsciinemaHeader {
  version: number;
  width: number;
  height: number;
  timestamp: number;
  env?: Record<string, string>;
}

type AsciinemaEvent = [number, "o", string];

export function AsciinemaPlayer({ recordingId, onClose }: { recordingId: string; onClose?: () => void }) {
  const [header, setHeader] = useState<AsciinemaHeader | null>(null);
  const [events, setEvents] = useState<AsciinemaEvent[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const { ref: termRef, write, resize } = useTerminal();
  const lastTimeRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const eventIndexRef = useRef(0);
  const isPlayingRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/recordings/${recordingId}`)
      .then(async (res) => {
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`API Error: ${res.status} - ${errText}`);
        }
        return res.text();
      })
      .then((text) => {
        const lines = text.split("\n").filter(Boolean);
        if (lines.length === 0) return;

        const h = JSON.parse(lines[0]) as AsciinemaHeader;
        const rawEvs = lines.slice(1).map((l) => {
          try {
            return JSON.parse(l) as AsciinemaEvent;
          } catch {
            return null;
          }
        }).filter(Boolean) as AsciinemaEvent[];

        let lastTime = 0;
        let timeOffset = 0;
        const evs = rawEvs.map((ev) => {
          let t = ev[0] - timeOffset;
          const delta = t - lastTime;
          if (delta > 2.0) {
            const skip = delta - 2.0;
            timeOffset += skip;
            t -= skip;
          }
          lastTime = t;
          return [t, ev[1], ev[2]] as AsciinemaEvent;
        });

        setHeader(h);
        setEvents(evs);
        setDuration(evs.length > 0 ? evs[evs.length - 1][0] : 0);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load recording", err);
        setError(err.message || "Failed to load recording");
        setLoading(false);
      });
  }, [recordingId]);

  const [ghosttyCore, setGhosttyCore] = useState<any>(null);

  useEffect(() => {
    let active = true;
    createGhosttyCore().then((c) => {
      if (active) setGhosttyCore(c);
    });
    return () => {
      active = false;
    };
  }, []);

  const [isTermReady, setIsTermReady] = useState(false);

  useEffect(() => {
    if (!isTermReady || !header) return;
    resize(header.width, header.height);
    
    // Draw first frame
    if (currentTime === 0 && !isPlaying && eventIndexRef.current === 0 && events.length > 0) {
      let i = 0;
      while (i < events.length && events[i][0] <= 0) {
        if (events[i][1] === "o") write(events[i][2]);
        i++;
      }
      eventIndexRef.current = i;
    }
  }, [isTermReady, header, events, resize, write]);

  const togglePlay = () => {
    if (currentTime >= duration) {
      setCurrentTime(0);
      eventIndexRef.current = 0;
      write("\x1b[2J\x1b[3J\x1b[H");
      setIsPlaying(true);
      return;
    }
    setIsPlaying((prev) => !prev);
  };

  useEffect(() => {
    isPlayingRef.current = isPlaying;

    if (isPlaying) {
      lastTimeRef.current = performance.now() - (currentTime * 1000);
      
      const loop = () => {
        if (!isPlayingRef.current) return;
        const now = performance.now();
        const nextTime = (now - lastTimeRef.current) / 1000;
        
        if (nextTime >= duration) {
          setCurrentTime(duration);
          setIsPlaying(false);
          
          while (eventIndexRef.current < events.length) {
            const ev = events[eventIndexRef.current];
            if (ev[1] === "o") write(ev[2]);
            eventIndexRef.current++;
          }
          return;
        }

        setCurrentTime(nextTime);

        while (eventIndexRef.current < events.length && events[eventIndexRef.current][0] <= nextTime) {
          const ev = events[eventIndexRef.current];
          if (ev[1] === "o") {
            write(ev[2]);
          }
          eventIndexRef.current++;
        }

        rafRef.current = requestAnimationFrame(loop);
      };

      rafRef.current = requestAnimationFrame(loop);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, duration, events, write]);

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    
    // Quick and dirty seek: clear and replay up to time
    if (termRef.current) {
      write("\x1b[2J\x1b[3J\x1b[H");
      let i = 0;
      while (i < events.length && events[i][0] <= time) {
        if (events[i][1] === "o") write(events[i][2]);
        i++;
      }
      eventIndexRef.current = i;
    }

    if (isPlaying) {
      lastTimeRef.current = performance.now() - (time * 1000);
    }
  };

  if (loading) {
    return <div className="p-8 text-zinc-400">Loading recording...</div>;
  }

  if (error) {
    return (
      <div className="flex flex-col bg-zinc-950 border border-zinc-800 rounded-md overflow-hidden max-w-full">
        <div className="bg-zinc-900 border-b border-zinc-800 p-2 flex items-center justify-between">
          <span className="text-xs font-mono text-zinc-400">ASCIINEMA REPLAY ERROR</span>
          {onClose && (
            <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
              &times;
            </button>
          )}
        </div>
        <div className="p-8 text-red-400 font-mono text-sm">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-zinc-950 border border-zinc-800 rounded-md overflow-hidden max-w-full">
      <div className="bg-zinc-900 border-b border-zinc-800 p-2 flex items-center justify-between">
        <span className="text-xs font-mono text-zinc-400 flex items-center gap-2">
          {header && <span className="bg-zinc-800 px-2 py-0.5 rounded text-[10px]">{header.width}x{header.height}</span>}
          <span>ASCIINEMA REPLAY</span>
        </span>
        {onClose && (
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            &times;
          </button>
        )}
      </div>

      <div className="relative overflow-hidden w-full flex justify-center bg-black p-4 min-h-[500px]">
        {ghosttyCore && (
          <Terminal 
            core={ghosttyCore} 
            ref={termRef} 
            className="w-full h-full" 
            theme="black"
            onReady={() => setIsTermReady(true)}
          />
        )}
      </div>

      <div className="bg-zinc-900 border-t border-zinc-800 p-3 flex items-center gap-4">
        <button
          onClick={togglePlay}
          className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white hover:bg-indigo-500 transition-colors"
        >
          {currentTime >= duration ? <RotateCcw className="w-4 h-4" /> : isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>

        <div className="flex-1 flex items-center gap-3">
          <span className="text-xs font-mono text-zinc-400 w-12 text-right">
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={currentTime}
            onChange={handleScrub}
            className="flex-1 accent-indigo-500 bg-zinc-800 h-1.5 rounded-full appearance-none outline-none"
          />
          <span className="text-xs font-mono text-zinc-400 w-12">
            {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
