import { productsIn } from "@/catalog";
import { CatalogGrid, CategoryNav } from "@/components/CatalogGrid";

export default function Home() {
  const products = productsIn();
  return (
    <div className="wrap">
      <CategoryNav />
      <h1 className="page-title">Shop all <span className="count">{products.length} products</span></h1>
      <CatalogGrid products={products} />
    </div>
  );
}
