"use client";
/**
 * Copy text, and say whether it worked.
 *
 * navigator.clipboard needs a secure context and a permission that some browsers refuse;
 * a silent catch there means a button that looks like it did something and did not. The
 * textarea fallback covers the refusal, and the boolean lets the caller tell the truth.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
