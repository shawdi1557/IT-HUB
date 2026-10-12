import { lazy as reactLazy, Suspense, type ComponentType } from "react"
import {
  createBrowserRouter,
  RouterProvider,
  isRouteErrorResponse,
  useRouteError,
} from "react-router"
import { StoreProvider } from "./store"
import Layout from "../components/Layout"
import Home from "../pages/Home"
import { Empty, Loading, Page } from "../components/ui"

// A stale module URL (after a hot update) makes dynamic imports fail;
// reload the page once to fetch fresh modules instead of crashing.
const lazy = <T extends ComponentType<any>,>(
  load: () => Promise<{ default: T }>,
) =>
  reactLazy(() =>
    load().then(
      (module) => {
        sessionStorage.removeItem("ithub-chunk-reload")
        return module
      },
      (error) => {
        if (!sessionStorage.getItem("ithub-chunk-reload")) {
          sessionStorage.setItem("ithub-chunk-reload", "1")
          window.location.reload()
          return new Promise<never>(() => {})
        }
        throw error
      },
    ),
  )
const Products = lazy(() =>
  import("../pages/Products").then((module) => ({ default: module.Products })),
)
const ProductDetail = lazy(() =>
  import("../pages/Products").then((module) => ({
    default: module.ProductDetail,
  })),
)
const Cart = lazy(() =>
  import("../pages/Commerce").then((module) => ({ default: module.Cart })),
)
const Checkout = lazy(() =>
  import("../pages/Commerce").then((module) => ({ default: module.Checkout })),
)
const OrderSuccess = lazy(() =>
  import("../pages/Commerce").then((module) => ({
    default: module.OrderSuccess,
  })),
)
const OrderTracking = lazy(() =>
  import("../pages/Commerce").then((module) => ({
    default: module.OrderTracking,
  })),
)
const DevRequest = lazy(() => import("../pages/DevRequest"))
const Services = lazy(() =>
  import("../pages/Services").then((module) => ({ default: module.Services })),
)
const ServiceBooking = lazy(() =>
  import("../pages/Services").then((module) => ({
    default: module.ServiceBooking,
  })),
)
const ServiceSuccess = lazy(() =>
  import("../pages/Services").then((module) => ({
    default: module.ServiceSuccess,
  })),
)
const ServiceTracking = lazy(() =>
  import("../pages/Services").then((module) => ({
    default: module.ServiceTracking,
  })),
)
const Builder = lazy(() => import("../pages/Builder"))
const Account = lazy(() => import("../pages/Account"))
const About = lazy(() =>
  import("../pages/Information").then((module) => ({ default: module.About })),
)
const Offers = lazy(() =>
  import("../pages/Information").then((module) => ({ default: module.Offers })),
)
const Contact = lazy(() =>
  import("../pages/Information").then((module) => ({
    default: module.Contact,
  })),
)
const Support = lazy(() => import("../pages/Support"))
const Admin = lazy(() => import("../pages/Admin"))
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
  )
}
function RouteError() {
  const error = useRouteError()
  return (
    <Page>
      <Empty
        title={
          isRouteErrorResponse(error) && error.status === 404
            ? "Page not found"
            : "Something interrupted this page."
        }
        description="Return to the store and try again. Your local demo data is preserved."
        to="/"
        label="Back to IT HUB"
      />
    </Page>
  )
}
const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    errorElement: <RouteError />,
    children: [
      { index: true, Component: Home },
      { path: "products", Component: Products },
      { path: "products/:id", Component: ProductDetail },
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
      { path: "account", Component: Account },
      { path: "account/:section", Component: Account },
      { path: "about", Component: About },
      { path: "offers", Component: Offers },
      { path: "contact", Component: Contact },
      { path: "support", Component: Support },
      { path: "*", Component: NotFound },
    ],
  },
  { path: "/admin", Component: Admin, errorElement: <RouteError /> },
  { path: "/admin/:section", Component: Admin, errorElement: <RouteError /> },
])
export default function App() {
  return (
    <StoreProvider>
      <Suspense fallback={<Loading />}>
        <RouterProvider router={router} />
      </Suspense>
    </StoreProvider>
  )
}
