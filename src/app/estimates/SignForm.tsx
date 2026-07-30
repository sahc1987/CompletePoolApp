"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { signEstimate } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { inputClass, labelClass } from "@/components/styles";
import type { ActionState } from "@/lib/actions";

// Canvas signature pad. Works with mouse and touch via pointer events; the
// captured stroke is written to a hidden input as a base64 PNG on each change.
export default function SignForm({ estimateId }: { estimateId: string }) {
  const [state, formAction] = useFormState<ActionState, FormData>(signEstimate, null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [data, setData] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Scale for crisp lines on high-DPI screens.
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1a2333";
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function end() {
    drawing.current = false;
    setData(canvasRef.current?.toDataURL("image/png") ?? "");
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setData("");
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="estimateId" value={estimateId} />
      <input type="hidden" name="signatureData" value={data} />

      <div>
        <label className={labelClass} htmlFor="signedByName">Client name</label>
        <input id="signedByName" name="signedByName" required className={inputClass} />
      </div>

      <div>
        <span className={labelClass}>Signature</span>
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          className="h-40 w-full touch-none rounded-lg border border-line bg-white"
        />
        <button
          type="button"
          onClick={clear}
          className="mt-1 text-sm text-navy-700 hover:underline"
        >
          Clear
        </button>
      </div>

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}

      <SubmitButton pendingLabel="Saving signature…">
        Approve &amp; sign
      </SubmitButton>
    </form>
  );
}
