import { permanentRedirect } from "next/navigation";

/** Old address for the custom door builder; everything now lives under /products. */
export default async function OldDoorPage({ params }: { params: Promise<{ handle: string }> }) {
  permanentRedirect(`/products/${(await params).handle}`);
}
