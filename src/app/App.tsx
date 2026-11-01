import { lazy as reactLazy, Suspense, type ComponentType } from "react";
import {
  createBrowserRouter,
  RouterProvider,
  isRouteErrorResponse,
  useRouteError,
} from "react-router";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { StoreProvider } from "./store";
import Layout from "../components/Layout";
import Home from "../pages/Home";
import { ActionLink, Button, Empty, Loading, Page } from "../components/ui";

// A stale module URL (after a hot update) makes dynamic imports fail;
// reload the page to fetch fresh modules instead of crashing, but guard against infinite loops.
const lazy = <T extends ComponentType<any>>(load: () => Promise<{ default: T }>) =>
  reactLazy(async () => {
    try {
      const module = await load();
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("ithub-chunk-reload");
      }
      return module;
    } catch (error) {
      if (typeof window !== "undefined") {
        const reloadCount = parseInt(sessionStorage.getItem("ithub-chunk-reload") || "0", 10);
        if (reloadCount < 1) {
          sessionStorage.setItem("ithub-chunk-reload", String(reloadCount + 1));
          window.location.reload();
          return new Promise<never>(() => {});
        }
        sessionStorage.removeItem("ithub-chunk-reload");
      }
      throw error;
    }
  });
const Products = lazy(() =>
  import("../pages/Products").then((module) => ({ default: module.Products })),
);
const ProductDetail = lazy(() =>
  import("../pages/Products").then((module) => ({
    default: module.ProductDetail,
  })),
);
const Cart = lazy(() => import("../pages/Commerce").then((module) => ({ default: module.Cart })));
const Checkout = lazy(() =>
  import("../pages/Commerce").then((module) => ({ default: module.Checkout })),
);
const OrderSuccess = lazy(() =>
  import("../pages/Commerce").then((module) => ({
    default: module.OrderSuccess,
  })),
);
const OrderTracking = lazy(() =>
  import("../pages/Commerce").then((module) => ({
    default: module.OrderTracking,
  })),
);
const DevRequest = lazy(() => import("../pages/DevRequest"));
const Services = lazy(() =>
  import("../pages/Services").then((module) => ({ default: module.Services })),
);
const ServiceBooking = lazy(() =>
  import("../pages/Services").then((module) => ({
    default: module.ServiceBooking,
  })),
);
const ServiceSuccess = lazy(() =>
  import("../pages/Services").then((module) => ({
    default: module.ServiceSuccess,
  })),
);
const ServiceTracking = lazy(() =>
  import("../pages/Services").then((module) => ({
    default: module.ServiceTracking,
  })),
);
const Builder = lazy(() => import("../pages/Builder"));
const Blog = lazy(() => import("../pages/Blog"));
const ArticleDetail = lazy(() =>
  import("../pages/Blog").then((module) => ({ default: module.ArticleDetail })),
);
const Account = lazy(() => import("../pages/Account"));
const About = lazy(() =>
  import("../pages/Information").then((module) => ({ default: module.About })),
);
const Offers = lazy(() =>
  import("../pages/Information").then((module) => ({ default: module.Offers })),
);
const Contact = lazy(() =>
  import("../pages/Information").then((module) => ({
    default: module.Contact,
  })),
);
const Support = lazy(() => import("../pages/Support"));
function NotFound() {
  return (
    <Page>
      <Empty
        title="This page took a wrong turn."
        description="Your technology journey is still right here."
        to="/"
        label="Back to IT HUB"
      />
    </Page>
  );
}
function RouteError() {
  const error = useRouteError();
  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : isRouteErrorResponse(error)
          ? `${error.status} ${error.statusText}`
          : "An unexpected error occurred.";

  const isNotFound = isRouteErrorResponse(error) && error.status === 404;

  return (
    <Page>
      <div className="mx-auto my-12 max-w-lg rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center shadow-xs">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle size={28} />
        </div>
        <h2 className="text-xl font-bold text-foreground">
          {isNotFound ? "Page Not Found" : "Something interrupted this page"}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
          {isNotFound ? "Your technology journey is still right here." : errorMessage}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {!isNotFound && (
            <Button
              variant="primary"
              onClick={() => {
                if (typeof window !== "undefined") {
                  sessionStorage.removeItem("ithub-chunk-reload");
                  window.location.reload();
                }
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold"
            >
              <RefreshCw size={14} />
              Retry
            </Button>
          )}
          <ActionLink to="/" secondary className="px-4 py-2 text-xs">
            Back to IT HUB
          </ActionLink>
        </div>
      </div>
    </Page>
  );
}

export function CatalogRouteError() {
  const error = useRouteError();
  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Catalog service is currently unavailable.";

  const isDynamicImportError =
    errorMessage.includes("Failed to fetch dynamically imported module") ||
    errorMessage.includes("Importing a module script failed");

  return (
    <Page>
      <div className="mx-auto my-12 max-w-lg rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center shadow-xs">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle size={28} />
        </div>
        <h2 className="text-xl font-bold text-foreground">
          {isDynamicImportError ? "Catalog Loading Interrupted" : "Catalog Connection Issue"}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
          {isDynamicImportError
            ? "A newer version of the catalog module was updated or network connectivity was temporarily interrupted."
            : errorMessage}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button
            variant="primary"
            onClick={() => {
              if (typeof window !== "undefined") {
                sessionStorage.removeItem("ithub-chunk-reload");
                window.location.reload();
              }
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold"
          >
            <RefreshCw size={14} />
            Reload & Retry Catalog
          </Button>
          <ActionLink to="/" secondary className="px-4 py-2 text-xs">
            Return to Store
          </ActionLink>
        </div>
      </div>
    </Page>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    errorElement: <RouteError />,
    children: [
      { index: true, Component: Home },
      { path: "products", Component: Products, errorElement: <CatalogRouteError /> },
      { path: "products/:id", Component: ProductDetail, errorElement: <CatalogRouteError /> },
      { path: "second-hand", Component: Products, errorElement: <CatalogRouteError /> },
      { path: "sell", Component: Products, errorElement: <CatalogRouteError /> },
      { path: "sell-your-item", Component: Products, errorElement: <CatalogRouteError /> },
      { path: "cart", Component: Cart },
      { path: "checkout", Component: Checkout },
      { path: "order-success/:id", Component: OrderSuccess },
      { path: "track-order", Component: OrderTracking },
      { path: "track-order/:id", Component: OrderTracking },
      { path: "services", Component: Services },
      { path: "services/book", Component: ServiceBooking },
      { path: "services/development", Component: DevRequest },
      { path: "service-success/:id", Component: ServiceSuccess },
      { path: "track-service", Component: ServiceTracking },
      { path: "track-service/:id", Component: ServiceTracking },
      { path: "pc-builder", Component: Builder },
      { path: "blog", Component: Blog },
      { path: "blog/:slug", Component: ArticleDetail },
      { path: "account", Component: Account },
      { path: "account/:section", Component: Account },
      { path: "about", Component: About },
      { path: "offers", Component: Offers },
      { path: "contact", Component: Contact },
      { path: "support", Component: Support },
      { path: "*", Component: NotFound },
    ],
  },
]);
export default function App() {
  return (
    <StoreProvider>
      <Suspense fallback={<Loading />}>
        <RouterProvider router={router} />
      </Suspense>
    </StoreProvider>
  );
}
