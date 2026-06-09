"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, Monitor, Terminal } from "lucide-react";
import type { ConnectionProtocol } from "@/lib/protocols";
import { cn } from "@/lib/utils";

const PROTOCOL_ICONS: Record<ConnectionProtocol, typeof Terminal> = {
  ssh: Terminal,
  telnet: Terminal,
  vnc: Monitor,
  rdp: Monitor,
};

interface WakeConnectButtonProps {
  href: string;
  protocol: ConnectionProtocol;
  connectionId?: string;
  quickSessionId?: string;
  macAddress?: string | null;
  label: string;
  className?: string;
}

export function WakeConnectButton({
  href,
  protocol,
  connectionId,
  quickSessionId,
  macAddress,
  label,
  className,
}: WakeConnectButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const shouldWake = (protocol === "vnc" || protocol === "rdp") && Boolean(macAddress?.trim());
  const Icon = PROTOCOL_ICONS[protocol];

  async function handleClick() {
    if (!shouldWake) {
      router.push(href);
      return;
    }

    if (!connectionId && !quickSessionId) {
      setStatus("Missing connection id for wake");
      return;
    }

    setLoading(true);
    setStatus("Sending wake packet…");

    try {
      const wakeUrl = quickSessionId
        ? `/api/quick-connect/${quickSessionId}/wake`
        : `/api/connections/${connectionId}/wake`;

      setStatus("Waking host (up to 3 min)…");

      const res = await fetch(wakeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ via: protocol, wait: true }),
      });

      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || "Wake failed");
        setLoading(false);
        return;
      }

      if (data.ready) {
        setStatus("Host is awake");
        router.push(href);
      } else {
        setStatus("Host did not wake — check WoL on the Ubuntu NIC (ethtool wol g)");
        setLoading(false);
      }
    } catch {
      setStatus("Wake failed");
      setLoading(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="outline"
        className={cn("gap-1.5", className)}
        disabled={loading}
        onClick={() => void handleClick()}
      >
        {loading ?
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : <Icon className="h-3.5 w-3.5" />}
        {label}
      </Button>
      {status && <span className="max-w-[180px] text-[10px] leading-tight text-zinc-500">{status}</span>}
    </div>
  );
}
