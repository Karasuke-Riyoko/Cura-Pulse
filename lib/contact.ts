/** Opens the phone's own SMS / WhatsApp / dialer with the message ready. Nothing is sent by CuraPulse servers. */
export const toIndian = (phone: string) => {
  const d = phone.replace(/\D/g, "");
  return d.length === 10 ? `91${d}` : d;
};
const isIOS = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);
export const smsHref = (phones: string[], body: string) =>
  `sms:${phones.map((p) => `+${toIndian(p)}`).join(",")}${isIOS() ? "&" : "?"}body=${encodeURIComponent(body)}`;
export const waHref = (phone: string, body: string) => `https://wa.me/${toIndian(phone)}?text=${encodeURIComponent(body)}`;
export const telHref = (phone: string) => `tel:+${toIndian(phone)}`;
export const validPhone = (phone: string) => phone.replace(/\D/g, "").length >= 10;
