"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, AlertTriangle, Check, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { api, ApiError } from "@/lib/api";
import { withRetry } from "@/lib/retry";
import { clearApiCache } from "@/lib/api-cache";
import type { JobKind, JobStatus } from "@/lib/types";

type Phase = "idle" | "starting" | "running" | "busy" | "cooldown" | "error";

const POLL_MS = 2500;

function fmtElapsed(s: number): string {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

export interface JobButtonProps {
  kind: JobKind;
  idleLabel: string; // "Recalcular" | "Actualizar consultas"
  runningVerb: string; // "Recalculando" | "Actualizando"
  icon: LucideIcon;
  onDone?: () => void;
  title?: string;
  className?: string;
}

/**
 * Triggers an async Spark job (recompute models / reingest dataset) and follows
 * it to completion. Demonstrates resilience patterns end-to-end:
 *  - retry with exponential backoff on transient (network / 5xx) failures,
 *  - respects server rate limiting (429 → cooldown countdown, no spamming),
 *  - single-flight aware (409 → follows the running job; shows "ocupado" if the
 *    OTHER kind of job is running),
 *  - clears the client cache and calls `onDone` to re-query once finished.
 */
export function JobButton({ kind, idleLabel, runningVerb, icon: Icon, onDone, title, className }: JobButtonProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedS, setElapsedS] = useState(0);
  const [cooldownS, setCooldownS] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [justDone, setJustDone] = useState(false);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  const enterCooldown = useCallback((secs: number) => {
    if (secs > 0) {
      setPhase("cooldown");
      setCooldownS(Math.ceil(secs));
    } else {
      setPhase("idle");
    }
  }, []);

  // Cooldown countdown.
  useEffect(() => {
    if (phase !== "cooldown") return;
    if (cooldownS <= 0) {
      setPhase("idle");
      return;
    }
    const t = setTimeout(() => setCooldownS((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, cooldownS]);

  // Elapsed ticker while our job runs.
  useEffect(() => {
    if (phase !== "running") return;
    const t = setInterval(() => setElapsedS((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Returns true when terminal (stop polling).
  const applyStatus = useCallback(
    (st: JobStatus): boolean => {
      if (!mounted.current) return true;
      if (st.running) {
        setPhase(st.kind === kind ? "running" : "busy");
        return false;
      }
      if (st.status === "error") {
        setError(st.error?.split("\n").slice(-1)[0] ?? "El proceso falló.");
        setPhase("error");
        return true;
      }
      if (st.status === "done") {
        clearApiCache();
        onDone?.();
        setJustDone(true);
        setTimeout(() => mounted.current && setJustDone(false), 4000);
        enterCooldown(st.retryAfter);
        return true;
      }
      if (st.retryAfter > 0) {
        enterCooldown(st.retryAfter);
        return true;
      }
      return true;
    },
    [kind, onDone, enterCooldown],
  );

  const poll = useCallback(async () => {
    try {
      const st = await withRetry(() => api.jobStatus(), {
        attempts: 5,
        onRetry: () => mounted.current && setRetrying(true),
      });
      if (!mounted.current) return;
      setRetrying(false);
      const terminal = applyStatus(st);
      if (!terminal) pollRef.current = setTimeout(poll, POLL_MS);
    } catch (e) {
      if (!mounted.current) return;
      setRetrying(false);
      setError(e instanceof Error ? e.message : "No se pudo consultar el estado.");
      setPhase("error");
    }
  }, [applyStatus]);

  const startPolling = useCallback(() => {
    if (pollRef.current) clearTimeout(pollRef.current);
    setElapsedS(0);
    pollRef.current = setTimeout(poll, 1200);
  }, [poll]);

  // On mount, reflect a job that may already be running globally.
  useEffect(() => {
    let cancelled = false;
    withRetry(() => api.jobStatus(), { attempts: 3 })
      .then((st) => {
        if (cancelled || !mounted.current) return;
        if (st.running) {
          setPhase(st.kind === kind ? "running" : "busy");
          startPolling();
        } else if (st.retryAfter > 0) {
          enterCooldown(st.retryAfter);
        }
      })
      .catch(() => {
        /* ignore initial sync errors */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trigger = useCallback(async () => {
    setError(null);
    setJustDone(false);
    setPhase("starting");
    try {
      const st = await withRetry(() => (kind === "reingest" ? api.startReingest() : api.startRecompute()), {
        attempts: 4,
        onRetry: () => mounted.current && setRetrying(true),
      });
      if (!mounted.current) return;
      setRetrying(false);
      applyStatus(st);
      startPolling();
    } catch (e) {
      if (!mounted.current) return;
      setRetrying(false);
      if (e instanceof ApiError && e.status === 429) {
        enterCooldown(e.retryAfter ?? 30);
        return;
      }
      if (e instanceof ApiError && e.status === 409) {
        // Another job is already running — follow it.
        setPhase("busy");
        startPolling();
        return;
      }
      setError(e instanceof Error ? e.message : "No se pudo iniciar el proceso.");
      setPhase("error");
    }
  }, [kind, applyStatus, startPolling, enterCooldown]);

  const busy = phase === "starting" || phase === "running" || phase === "busy";
  const disabled = busy || phase === "cooldown";

  let IconEl: ReactNode = <Icon size={14} />;
  let label = idleLabel;
  if (phase === "starting") {
    IconEl = <Loader2 size={14} className="animate-spin" />;
    label = "Iniciando…";
  } else if (phase === "running") {
    IconEl = <Loader2 size={14} className="animate-spin" />;
    label = `${runningVerb} ${fmtElapsed(elapsedS)}`;
  } else if (phase === "busy") {
    IconEl = <Loader2 size={14} className="animate-spin" />;
    label = "Procesando…";
  } else if (phase === "cooldown") {
    IconEl = justDone ? <Check size={14} /> : <Icon size={14} />;
    label = justDone ? `Listo · espera ${cooldownS}s` : `Disponible en ${cooldownS}s`;
  } else if (phase === "error") {
    IconEl = <AlertTriangle size={14} />;
    label = "Reintentar";
  }

  return (
    <div className={cn("relative", className)}>
      <button
        onClick={trigger}
        disabled={disabled}
        title={title}
        className={cn(
          "inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:cursor-not-allowed",
          phase === "error"
            ? "border-red-400/40 bg-red-400/10 text-red-200 hover:bg-red-400/20"
            : "border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white",
          disabled && "opacity-70",
        )}
      >
        {IconEl}
        <span className="hidden sm:inline">{label}</span>
      </button>
      {retrying && (
        <span className="absolute -bottom-4 left-0 text-[10px] text-amber-300 whitespace-nowrap">reintentando…</span>
      )}
      {phase === "error" && error && (
        <span className="absolute -bottom-4 left-0 max-w-[220px] truncate text-[10px] text-red-300" title={error}>
          {error}
        </span>
      )}
    </div>
  );
}
