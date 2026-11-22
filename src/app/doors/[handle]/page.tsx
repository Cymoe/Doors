import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDoor, liveProducts, store } from "@/catalog";
import { DoorBuilder } from "@/components/DoorBuilder";

export const dynamicParams = false;

export function generateStaticParams() {
  return liveProducts()
    .filter((p) => p.type === "door")
    .map((p) => ({ handle: p.handle }));
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const door = getDoor((await params).handle);
  if (!door) return {};
  return {
    title: { absolute: door.seo?.title ?? door.title },
    description: door.seo?.description ?? door.description.slice(0, 300),
  };
}

export default async function DoorPage({ params }: { params: Promise<{ handle: string }> }) {
  const door = getDoor((await params).handle);
  if (!door) notFound();
  return (
    <div className="wrap">
      <DoorBuilder product={door} store={store} />
    </div>
  );
}
