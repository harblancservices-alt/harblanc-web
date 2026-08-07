"use client";

/** Shared preview rendering for the Estimate/Finalized Quote/BOL composers
 * — all three return the same {to,from,replyTo,subject,preheader,html,text}
 * shape. Sending reads the persisted snapshot verbatim (V1's
 * preview-bytes-==-sent-bytes invariant), so this is exactly what goes out. */
export type Preview = {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  preheader: string;
  html: string;
  text: string;
};

export function PreviewPane({ preview }: { preview: Preview }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line-strong bg-elevated p-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-fg-muted">
        <span>
          <span className="font-medium text-fg">To:</span> {preview.to}
        </span>
        <span>
          <span className="font-medium text-fg">From:</span> {preview.from}
        </span>
      </div>
      <p className="text-[13px] font-semibold text-fg">{preview.subject}</p>
      <div className="overflow-hidden rounded-md border border-line bg-white">
        <iframe title="Email preview" srcDoc={preview.html} className="h-[420px] w-full" sandbox="" />
      </div>
    </div>
  );
}
