"use client";

import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { Play, Trash2 } from "lucide-react";
import { AsciinemaPlayer } from "@/components/AsciinemaPlayer";

interface Recording {
  id: string;
  name: string;
  duration: number;
  created_at: string;
  connection_name: string;
  hostname: string;
}

export function ReplayCenter() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRecordingId, setActiveRecordingId] = useState<string | null>(null);

  const fetchRecordings = () => {
    setLoading(true);
    fetch("/api/recordings")
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Failed to fetch recordings");
        }
        return res.json();
      })
      .then((data) => {
        setRecordings(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch recordings", err);
        setRecordings([]);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchRecordings();
  }, []);

  const deleteRecording = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this recording?")) return;
    
    fetch(`/api/recordings/${id}`, { method: "DELETE" })
      .then(() => fetchRecordings())
      .catch((err) => console.error("Failed to delete", err));
  };

  if (loading) {
    return <div className="text-zinc-500 text-sm py-4">Loading replays...</div>;
  }

  if (recordings.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-zinc-100">Session Replays</h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {recordings.map((recording) => (
          <div
            key={recording.id}
            onClick={() => setActiveRecordingId(recording.id)}
            className="group flex items-center justify-between p-3 rounded-md bg-zinc-900 border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center">
                <Play className="w-4 h-4 text-indigo-400 ml-0.5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-200 truncate">
                  {recording.name || "Untitled Recording"}
                </p>
                <p className="text-xs text-zinc-500 truncate">
                  {recording.connection_name || recording.hostname} &bull;{" "}
                  {formatDistanceToNow(new Date(recording.created_at), { addSuffix: true })} &bull;{" "}
                  {Math.round(recording.duration)}s
                </p>
              </div>
            </div>
            
            <button
              onClick={(e) => deleteRecording(recording.id, e)}
              className="p-2 text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {activeRecordingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 md:p-12">
          <div className="w-full max-w-5xl max-h-full flex flex-col shadow-2xl rounded-lg overflow-hidden ring-1 ring-white/10">
            <AsciinemaPlayer recordingId={activeRecordingId} onClose={() => setActiveRecordingId(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
