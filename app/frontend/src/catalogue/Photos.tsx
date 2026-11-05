import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import * as I from "../icons";
import { Button, cx, Dialog, Field, useToast } from "../ui";

interface Img {
  id: number;
  src: string;
  status: "verified" | "needs_review" | "approved" | "rejected";
  source: "ebay_api" | "manual_upload";
  sort: number;
  score: number | null;
  seen_title: string | null;
}
interface Data {
  images: Img[];
  check: { state: string; detail: string; checked_at: string } | null;
  source: { kind: string; detail: string };
}

const LABEL: Record<Img["status"], string> = { verified: "Verified", needs_review: "To review", approved: "Approved", rejected: "Rejected" };

export default function Photos({ itemId }: { itemId: number }) {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const load = useCallback(() => api<Data>(`/api/items/${itemId}/images`).then(setData), [itemId]);
  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const act = async (img: Img, action: string) => {
    try {
      await api(`/api/images/${img.id}`, { body: { action } });
      load();
    } catch (e: any) {
      toast({ text: e.message, tone: "error" });
    }
  };

  if (!data) return null;
  const live = data.images.filter((i) => i.status === "verified" || i.status === "approved");
  return (
    <section className="insp-section">
      <div className="section-head">
        <h3>Photos</h3>
        <span className="muted small-note">{live.length ? `${live.length} shown on the website` : "None shown on the website"}</span>
      </div>
      {data.images.length > 0 ? (
        <div className="insp-photos">
          {data.images.map((img) => (
            <div key={img.id} className={cx("insp-photo", img.status === "rejected" && "dim")}>
              <img src={img.src} alt="" loading="lazy" referrerPolicy="no-referrer" />
              <span className={cx("photo-badge", `pb-${img.status}`)}>{LABEL[img.status]}</span>
              <div className="insp-photo-actions">
                {(img.status === "needs_review" || img.status === "rejected") && (
                  <button className="link-btn" onClick={() => act(img, "approve")}>
                    Approve
                  </button>
                )}
                {img.status !== "rejected" && (
                  <button className="link-btn" onClick={() => act(img, "reject")}>
                    Reject
                  </button>
                )}
                {img.sort !== 1 && img.status !== "rejected" && (
                  <button className="link-btn" onClick={() => act(img, "primary")}>
                    Main
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="field-hint photo-hint">{data.check?.detail ?? data.source.detail}</p>
      )}
      <div className="row-actions">
        <Button size="sm" variant="plain" icon={<I.Photo size={13} />} onClick={() => input.current?.click()}>
          Upload photo
        </Button>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) setFile(f);
          }}
        />
      </div>
      {file && <UploadDialog file={file} itemId={itemId} onClose={() => setFile(null)} onDone={() => (setFile(null), load())} />}
    </section>
  );
}

function UploadDialog({ file, itemId, onClose, onDone }: { file: File; itemId: number; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [rights, setRights] = useState("My own photo");
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url] = useState(() => URL.createObjectURL(file));
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const upload = async () => {
    const form = new FormData();
    form.append("file", file);
    form.append("rights", rights);
    try {
      await api(`/api/items/${itemId}/images`, { form });
      toast({ text: "Photo added. It appears on the website from the next release." });
      onDone();
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <Dialog
      title="Add a product photo"
      onClose={onClose}
      width={460}
      footer={
        <>
          <Button variant="plain" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!ok || rights.trim().length < 3} onClick={upload}>
            Add photo
          </Button>
        </>
      }
    >
      <img src={url} alt="" className="upload-preview" />
      <Field label="Where the photo comes from" error={error}>
        <input className="input" value={rights} onChange={(e) => setRights(e.target.value)} />
      </Field>
      <label className="check-line">
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
        <span>I own this photo or have permission to use it on the reseller website, and it shows this exact product.</span>
      </label>
    </Dialog>
  );
}
