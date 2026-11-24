import { useEffect, useState, type FormEvent } from "react";
import { ImagePlus, RefreshCw, Save, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/commerce/api";
import { dateTime, failure, useAdminData } from "./data";
import { Empty, ErrorBox, Loading, Modal, PageHead, Status } from "./shared";
import type { AdminProduct } from "./types";

interface TryOnSettings {
  enabled: boolean;
  configured: boolean;
  apiKey: string;
  model: string;
  dailyLimit: number;
  modelImages: { men: string; women: string };
  supportedModels?: string[];
}
interface TryOnJob {
  id: string;
  key: string;
  gender: "men" | "women";
  status: string;
  imageUrl?: string | null;
  message?: string | null;
  createdAt: string;
  updatedAt: string;
}
interface ProductTryOn {
  enabled: boolean;
  colorImages: Record<string, string>;
  ready?: boolean;
}
const DEFAULT_MODEL_IMAGES = {
  men: "/images/looks/men/m-shirt-oxford--sky__m-pant-chino--khaki__m-shoe-sneaker--white.webp",
  women:
    "/images/looks/women/w-shirt-camp--champagne__w-pant-jean--indigo__w-shoe-pump--black.webp",
};

function imageFileError(file: File) {
  return !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 5 * 1024 * 1024
    ? "Choose a PNG, JPEG or WebP image under 5 MB."
    : "";
}
async function uploadImage(file: File) {
  const invalid = imageFileError(file);
  if (invalid) throw new Error(invalid);
  return api<{ url: string }>("/admin/uploads", {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
  });
}

function PhotoField({
  label,
  image,
  busy,
  onUpload,
  onRemove,
}: {
  label: string;
  image: string;
  busy: boolean;
  onUpload: (file: File) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="admin-tryon-photo">
      {image ? (
        <img src={image} alt={label} />
      ) : (
        <div className="admin-tryon-photo-empty">
          <ImagePlus size={25} />
          <span>Photo needed</span>
        </div>
      )}
      <div className="admin-tryon-photo-controls">
        <strong>{label}</strong>
        <label className="admin-button">
          <Upload size={14} /> {busy ? "Uploading…" : "Upload photo"}
          <input
            type="file"
            className="admin-visually-hidden"
            accept="image/jpeg,image/png,image/webp"
            aria-label={`Upload ${label}`}
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file);
              event.target.value = "";
            }}
          />
        </label>
        {image && onRemove && (
          <button type="button" className="admin-text-link" disabled={busy} onClick={onRemove}>
            Remove photo
          </button>
        )}
      </div>
    </div>
  );
}

export function AdminTryOn() {
  const settings = useAdminData<TryOnSettings>("/admin/try-on/settings");
  const jobs = useAdminData<{ jobs: TryOnJob[] }>("/admin/try-on/jobs");
  const [form, setForm] = useState<TryOnSettings | null>(null);
  const [key, setKey] = useState("");
  const [removeKey, setRemoveKey] = useState(false);
  const [limit, setLimit] = useState("20");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!settings.data) return;
    setForm(structuredClone(settings.data));
    setLimit(String(settings.data.dailyLimit));
    setKey("");
    setRemoveKey(false);
    setError("");
  }, [settings.data]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    const dailyLimit = Number(limit);
    if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 1000) {
      setError("Choose a whole daily generation limit between 1 and 1,000.");
      return;
    }
    if (form.enabled && (removeKey || !(key.trim() || form.configured))) {
      setError("Add an OpenAI API key before enabling new image generation.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const saved = await api<TryOnSettings>("/admin/try-on/settings", {
        method: "PATCH",
        body: JSON.stringify({
          enabled: form.enabled,
          apiKey: removeKey ? "" : key.trim() || (form.configured ? "********" : ""),
          model: form.model,
          dailyLimit,
          modelImages: form.modelImages,
        }),
      });
      settings.setData(saved);
      toast.success("AI fitting room settings saved");
    } catch (reason) {
      setError(failure(reason));
    } finally {
      setBusy(false);
    }
  }
  async function uploadModel(gender: "men" | "women", file: File) {
    setUploading(gender);
    setError("");
    try {
      const uploaded = await uploadImage(file);
      setForm((current) =>
        current
          ? { ...current, modelImages: { ...current.modelImages, [gender]: uploaded.url } }
          : current,
      );
    } catch (reason) {
      setError(failure(reason));
    } finally {
      setUploading("");
    }
  }
  return (
    <>
      <PageHead
        title="Every piece, in the picture"
        description="Let customers preview new garments together on your store models."
      >
        <span className="admin-pill">
          <Sparkles size={13} /> AI fitting room
        </span>
      </PageHead>
      <ErrorBox error={settings.error} retry={settings.reload} />
      {settings.loading ? (
        <Loading />
      ) : (
        form && (
          <form onSubmit={save} className="admin-stack">
            <ErrorBox error={error} />
            <section className="admin-card admin-settings-card">
              <div className="admin-card-title">
                <h2>Image service</h2>
                <Status value={form.enabled && form.configured ? "active" : "inactive"} />
              </div>
              <p className="admin-section-note">
                Create complete outfit previews from your product photos through the OpenAI API.
                Save your API key here or set OPENAI_API_KEY on the server. Saved keys are
                encrypted.
              </p>
              <div className="admin-form-grid">
                <label className="admin-field">
                  OpenAI API key
                  <input
                    type="password"
                    autoComplete="new-password"
                    maxLength={4096}
                    value={key}
                    onChange={(event) => setKey(event.target.value)}
                    placeholder={
                      form.configured
                        ? "Saved securely — leave blank to keep"
                        : "Enter your API key"
                    }
                    disabled={busy || removeKey}
                  />
                  <small>
                    {form.configured
                      ? "A saved key is configured. Its value is never shown."
                      : "An API key and API billing are needed for new previews."}
                  </small>
                </label>
                <label className="admin-field">
                  Image model
                  <select
                    value={form.model}
                    onChange={(event) => setForm({ ...form, model: event.target.value })}
                    disabled={busy}
                  >
                    {(settings.data?.supportedModels?.length
                      ? settings.data.supportedModels
                      : ["gpt-image-2"]
                    ).map((model) => (
                      <option value={model} key={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-field">
                  Daily new-image limit
                  <input
                    type="number"
                    required
                    min={1}
                    max={1000}
                    step={1}
                    value={limit}
                    onChange={(event) => setLimit(event.target.value)}
                    disabled={busy}
                  />
                  <small>
                    Resets at midnight UTC (06:00 in Bangladesh). Failed attempts and retries also
                    count. Reusing a saved image needs no new generation.
                  </small>
                </label>
                <div className="admin-field">
                  <span>Service status</span>
                  <label className="admin-checkbox">
                    <input
                      type="checkbox"
                      checked={form.enabled}
                      onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
                      disabled={busy}
                    />{" "}
                    Enable new AI previews
                  </label>
                  {form.configured && (
                    <label className="admin-checkbox">
                      <input
                        type="checkbox"
                        checked={removeKey}
                        onChange={(event) => setRemoveKey(event.target.checked)}
                        disabled={busy}
                      />{" "}
                      Remove saved key
                    </label>
                  )}
                </div>
              </div>
              <p className="admin-secret-note">
                Each new or retried image uses your connected AI service and may incur a charge.
                Existing prepared studio looks remain available unless their product photos are
                replaced. AI previews show appearance; they do not certify garment sizing or
                guarantee a perfect fit.
              </p>
            </section>
            <section className="admin-card admin-settings-card">
              <div className="admin-card-title">
                <h2>Your reference models</h2>
              </div>
              <p className="admin-section-note">
                Use clear, full-body, front-facing photographs with the feet visible and a plain
                background. The current store models are provided by default.
              </p>
              <div className="admin-tryon-photo-grid">
                {(["men", "women"] as const).map((gender) => (
                  <div key={gender}>
                    <PhotoField
                      label={`${gender === "men" ? "Men's" : "Women's"} model reference`}
                      image={form.modelImages[gender]}
                      busy={busy || Boolean(uploading)}
                      onUpload={(file) => void uploadModel(gender, file)}
                    />
                    {form.modelImages[gender] !== DEFAULT_MODEL_IMAGES[gender] && (
                      <button
                        type="button"
                        className="admin-small-button"
                        disabled={busy || Boolean(uploading)}
                        onClick={() =>
                          setForm({
                            ...form,
                            modelImages: {
                              ...form.modelImages,
                              [gender]: DEFAULT_MODEL_IMAGES[gender],
                            },
                          })
                        }
                      >
                        Use original store model
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="admin-form-footer">
                <button
                  type="button"
                  className="admin-button"
                  disabled={busy || Boolean(uploading)}
                  onClick={() => {
                    if (settings.data) {
                      settings.setData(structuredClone(settings.data));
                    }
                  }}
                >
                  Reset changes
                </button>
                <button
                  className="admin-button admin-button-primary"
                  disabled={busy || Boolean(uploading)}
                >
                  <Save size={14} /> {busy ? "Saving…" : "Save AI settings"}
                </button>
              </div>
            </section>
          </form>
        )
      )}
      <section className="admin-card admin-tryon-jobs">
        <div className="admin-card-title">
          <div>
            <h2>Recent previews</h2>
            <p className="admin-section-note">
              Only newly requested combinations create jobs. Existing images are reused.
            </p>
          </div>
          <button
            type="button"
            className="admin-button"
            onClick={jobs.reload}
            disabled={jobs.loading}
          >
            <RefreshCw size={14} /> Refresh previews
          </button>
        </div>
        <ErrorBox error={jobs.error} retry={jobs.reload} />
        {jobs.loading ? (
          <Loading />
        ) : jobs.data?.jobs.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Preview</th>
                  <th>Collection</th>
                  <th>Status</th>
                  <th>Requested</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {jobs.data.jobs.map((job) => (
                  <tr key={job.id}>
                    <td>
                      {job.imageUrl ? (
                        <a
                          href={job.imageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="admin-tryon-preview-link"
                        >
                          <img src={job.imageUrl} alt="Generated outfit" loading="lazy" /> View
                          preview
                        </a>
                      ) : (
                        <span className="admin-muted">Awaiting image</span>
                      )}
                    </td>
                    <td>{job.gender === "men" ? "Men" : "Women"}</td>
                    <td>
                      <Status value={job.status} />
                    </td>
                    <td>{dateTime(job.createdAt)}</td>
                    <td>
                      <span className="admin-tryon-job-note">
                        {job.message ||
                          (job.status === "ready"
                            ? "Saved for future visits"
                            : "No action required")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !jobs.error && (
            <Empty title="Ready for the first new look">
              Upload each colour's garment photo in Products → Fitting preview, then enable the
              service above.
            </Empty>
          )
        )}
      </section>
    </>
  );
}

export function ProductTryOnModal({
  product,
  onClose,
  onSaved,
}: {
  product: AdminProduct;
  onClose: () => void;
  onSaved: () => void;
}) {
  const source = useAdminData<ProductTryOn>(
    `/admin/products/${encodeURIComponent(product.id)}/try-on`,
  );
  const [form, setForm] = useState<ProductTryOn | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState("");
  useEffect(() => {
    if (source.data) setForm(structuredClone(source.data));
  }, [source.data]);
  async function uploadColour(colorId: string, file: File) {
    setError("");
    setUploading(colorId);
    try {
      const uploaded = await uploadImage(file);
      setForm((current) =>
        current
          ? { ...current, colorImages: { ...current.colorImages, [colorId]: uploaded.url } }
          : current,
      );
    } catch (reason) {
      setError(failure(reason));
    } finally {
      setUploading("");
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    if (form.enabled && product.colors.some((color) => !form.colorImages[color.id])) {
      setError(
        "Add the actual product photograph for every colour before enabling the fitting preview.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/admin/products/${encodeURIComponent(product.id)}/try-on`, {
        method: "PATCH",
        body: JSON.stringify({
          enabled: form.enabled,
          colorImages: Object.fromEntries(
            product.colors
              .filter((color) => form.colorImages[color.id])
              .map((color) => [color.id, form.colorImages[color.id]]),
          ),
        }),
      });
      toast.success("Fitting preview photos saved");
      onSaved();
      onClose();
    } catch (reason) {
      setError(failure(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`Fitting preview · ${product.name}`}
      description="Give the fitting room the actual garment photo for every colour, including its print, cut and details."
      onClose={() => {
        if (!busy && !uploading) onClose();
      }}
    >
      <ErrorBox error={source.error} retry={source.reload} />
      {source.loading ? (
        <Loading />
      ) : (
        form && (
          <form onSubmit={save}>
            <ErrorBox error={error} />
            {product.studioSupported && (
              <p className="admin-notice">
                This product already works instantly and can be paired with new AI-ready products
                using its prepared photos. Enable AI photos here only when replacing this product's
                reference images. Enabling replaces its instant prepared looks with generated
                previews.
              </p>
            )}
            <p className="admin-section-note">
              Upload a clear front view of the{" "}
              {product.category === "shoes" ? "pair of shoes" : "garment"}, without other products
              covering it. Each colour needs its own photograph; one image cannot faithfully
              describe different prints or colours.
            </p>
            <div className="admin-tryon-product-photos">
              {product.colors.map((color) => (
                <PhotoField
                  key={color.id}
                  label={`${color.name} garment photo`}
                  image={form.colorImages[color.id] || ""}
                  busy={busy || Boolean(uploading)}
                  onUpload={(file) => void uploadColour(color.id, file)}
                  onRemove={() =>
                    setForm({ ...form, colorImages: { ...form.colorImages, [color.id]: "" } })
                  }
                />
              ))}
            </div>
            {product.colors.length === 1 &&
              product.imageUrl?.startsWith("/uploads/") &&
              !form.colorImages[product.colors[0]!.id] && (
                <button
                  type="button"
                  className="admin-button"
                  disabled={busy || Boolean(uploading)}
                  onClick={() =>
                    setForm({
                      ...form,
                      colorImages: {
                        ...form.colorImages,
                        [product.colors[0]!.id]: product.imageUrl!,
                      },
                    })
                  }
                >
                  Use this product's uploaded photo
                </button>
              )}
            <label className="admin-checkbox admin-tryon-enable">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
                disabled={busy || Boolean(uploading)}
              />{" "}
              Make this product available for AI fitting previews
            </label>
            <p className="admin-secret-note">
              Photo setup can be saved before connecting AI. New images are created only after the
              store owner enables the AI fitting room service. This is a visual preview, not a
              measurement of physical fit.
            </p>
            <div className="admin-form-footer">
              <button
                type="button"
                className="admin-button"
                onClick={onClose}
                disabled={busy || Boolean(uploading)}
              >
                Cancel
              </button>
              <button
                className="admin-button admin-button-primary"
                disabled={busy || Boolean(uploading)}
              >
                {busy ? "Saving…" : "Save fitting preview"}
              </button>
            </div>
          </form>
        )
      )}
    </Modal>
  );
}
