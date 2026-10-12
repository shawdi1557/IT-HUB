import { useState, useRef, useEffect, type ChangeEvent } from "react"
import {
  Smartphone,
  Laptop,
  Monitor,
  Printer,
  Tablet,
  Headphones,
  Cpu,
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  FileText,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  BadgeIndianRupee,
} from "lucide-react"
import { useStore } from "../app/store"
import {
  sellCategories,
  productConditions,
  type SellCategory,
  type ProductCondition,
  type SellRequest,
} from "../data/catalog"
import { submitSellRequest } from "../lib/sellRequests"
import { Button, Badge, fieldClass } from "./ui"
import { LoginGate } from "./AuthModal"

const categoryIcons: Record<SellCategory, typeof Smartphone> = {
  Phone: Smartphone,
  Laptop: Laptop,
  "Desktop / PC": Cpu,
  Monitor: Monitor,
  Printer: Printer,
  Tablet: Tablet,
  Accessories: Headphones,
  "Other Electronics": Sparkles,
}

// Comprehensive brand and model catalog per category
export const sellCatalog: Record<SellCategory, {
  brands: {
    name: string
    models: string[]
  }[]
}> = {
  Phone: {
    brands: [
      {
        name: "Apple",
        models: [
          "iPhone 15 Pro Max",
          "iPhone 15 Pro",
          "iPhone 15 Plus",
          "iPhone 15",
          "iPhone 14 Pro Max",
          "iPhone 14 Pro",
          "iPhone 14",
          "iPhone 13 Pro Max",
          "iPhone 13",
          "iPhone 12",
          "iPhone 11",
          "iPhone SE (3rd Gen)",
          "Other Apple iPhone",
        ],
      },
      {
        name: "Samsung",
        models: [
          "Galaxy S24 Ultra",
          "Galaxy S24+",
          "Galaxy S24",
          "Galaxy S23 Ultra",
          "Galaxy S23",
          "Galaxy S22 Ultra",
          "Galaxy S22",
          "Galaxy Z Fold 5",
          "Galaxy Z Flip 5",
          "Galaxy A54 5G",
          "Galaxy A34 5G",
          "Galaxy M34 5G",
          "Other Samsung Galaxy",
        ],
      },
      {
        name: "OnePlus",
        models: [
          "OnePlus 12",
          "OnePlus 12R",
          "OnePlus 11",
          "OnePlus 11R",
          "OnePlus 10 Pro",
          "OnePlus Nord CE 4",
          "OnePlus Nord 3",
          "Other OnePlus Phone",
        ],
      },
      {
        name: "Xiaomi / Redmi",
        models: [
          "Xiaomi 14",
          "Xiaomi 13 Pro",
          "Redmi Note 13 Pro+",
          "Redmi Note 13 Pro",
          "Redmi Note 12 Pro",
          "Redmi 12 5G",
          "Other Xiaomi / Redmi",
        ],
      },
      {
        name: "Vivo",
        models: [
          "Vivo X100 Pro",
          "Vivo X90 Pro",
          "Vivo V30 Pro",
          "Vivo V29 Pro",
          "Vivo T2 Pro",
          "Other Vivo Phone",
        ],
      },
      {
        name: "Oppo",
        models: [
          "Oppo Find N3 Flip",
          "Oppo Reno 11 Pro",
          "Oppo Reno 10 Pro",
          "Oppo F25 Pro",
          "Other Oppo Phone",
        ],
      },
      {
        name: "Realme",
        models: [
          "Realme 12 Pro+",
          "Realme GT 6T",
          "Realme 11 Pro+",
          "Realme Narzo 60 Pro",
          "Other Realme Phone",
        ],
      },
      {
        name: "Google Pixel",
        models: [
          "Pixel 8 Pro",
          "Pixel 8",
          "Pixel 7a",
          "Pixel 7 Pro",
          "Pixel 6a",
          "Other Google Pixel",
        ],
      },
      {
        name: "Other Brand",
        models: ["Other Model"],
      },
    ],
  },
  Laptop: {
    brands: [
      {
        name: "Apple",
        models: [
          'MacBook Air M3 (13" / 15")',
          'MacBook Air M2 (13" / 15")',
          "MacBook Air M1 (13-inch)",
          'MacBook Pro 14" (M3 / M2 / M1)',
          'MacBook Pro 16" (M3 / M2 / M1)',
          'MacBook Pro 13" (M2 / M1)',
          "Other Apple MacBook",
        ],
      },
      {
        name: "Dell",
        models: [
          "XPS 15",
          "XPS 13",
          "Inspiron 15 (3000 / 5000 Series)",
          "Inspiron 14 Plus",
          "Latitude 7420 / 7490",
          "G15 / G16 Gaming Laptop",
          "Alienware m16 / m18",
          "Other Dell Laptop",
        ],
      },
      {
        name: "HP",
        models: [
          "Pavilion 15 Gaming",
          "Pavilion 14 / 15",
          "Victus 15 / 16 Gaming",
          "Omen 16 / 17 Gaming",
          "Envy x360 2-in-1",
          "Spectre x360",
          "EliteBook 840 Series",
          "Other HP Laptop",
        ],
      },
      {
        name: "Lenovo",
        models: [
          "ThinkPad X1 Carbon",
          "ThinkPad T14 / E14",
          "Legion 5 / Pro 5 Gaming",
          "LOQ 15 Gaming",
          "IdeaPad Gaming 3",
          "IdeaPad Slim 3 / 5",
          "Yoga 7 / 9 2-in-1",
          "Other Lenovo Laptop",
        ],
      },
      {
        name: "ASUS",
        models: [
          "ROG Zephyrus G14 / G16",
          "ROG Strix G16",
          "TUF Gaming A15 / F15",
          "ZenBook 14 OLED",
          "Vivobook 15 / 16",
          "Other ASUS Laptop",
        ],
      },
      {
        name: "Acer",
        models: [
          "Predator Helios 16 / 300",
          "Nitro 5 / 16 Gaming",
          "Swift Go 14",
          "Aspire 5 / 7",
          "Other Acer Laptop",
        ],
      },
      {
        name: "MSI",
        models: [
          "Katana 15 / 17",
          "Stealth 16 Studio",
          "GF63 Thin Gaming",
          "Bravo 15",
          "Modern 14 / 15",
          "Other MSI Laptop",
        ],
      },
      {
        name: "Other Brand",
        models: ["Other Model"],
      },
    ],
  },
  "Desktop / PC": {
    brands: [
      {
        name: "Custom Assembled PC",
        models: [
          "Intel Core i9 Gaming Build",
          "Intel Core i7 / i5 Gaming Build",
          "AMD Ryzen 9 / 7 Gaming Rig",
          "AMD Ryzen 5 Home & Office PC",
          "Content Creation & 3D Workstation",
          "Budget Compact / Mini ITX PC",
          "Other Custom Rig",
        ],
      },
      {
        name: "Apple",
        models: [
          "Mac mini M2 / M2 Pro",
          "Mac mini M1",
          "Mac Studio M2 / M1",
          'iMac 24" (M3 / M1)',
          "Mac Pro Workstation",
          "Other Apple Mac Desktop",
        ],
      },
      {
        name: "HP",
        models: [
          "Pavilion Gaming Desktop",
          "OMEN 25L / 40L Gaming",
          "ProDesk / EliteDesk Mini",
          "Slim Desktop Tower",
          "All-in-One 24 / 27",
          "Other HP Desktop",
        ],
      },
      {
        name: "Dell",
        models: [
          "OptiPlex Micro / SFF / Tower",
          "Inspiron Desktop Tower",
          "Alienware Aurora Gaming",
          "Precision Tower Workstation",
          "All-in-One Inspiron",
          "Other Dell Desktop",
        ],
      },
      {
        name: "Lenovo",
        models: [
          "ThinkCentre Tiny (M70q / M720q)",
          "Legion Tower 5i / 7i",
          "IdeaCentre 3 / 5 Tower",
          "IdeaCentre AIO 3 All-in-One",
          "Other Lenovo Desktop",
        ],
      },
      {
        name: "Other Brand",
        models: ["Other Model"],
      },
    ],
  },
  Monitor: {
    brands: [
      {
        name: "LG",
        models: [
          'UltraGear 27" (144Hz / 165Hz / 240Hz)',
          'UltraGear 32" QHD Gaming',
          'UltraFine 27" 4K IPS',
          '24" Full HD IPS (24MP400)',
          '29" / 34" Ultrawide Curved',
          "Other LG Monitor",
        ],
      },
      {
        name: "Samsung",
        models: [
          "Odyssey G7 / G9 Curved Gaming",
          'Odyssey G5 27" QHD',
          'Odyssey G3 24" 144Hz',
          'Smart Monitor M7 / M8 32"',
          '24" / 27" Essential Curved',
          "Other Samsung Monitor",
        ],
      },
      {
        name: "Dell",
        models: [
          'UltraSharp 27" 4K (U2723QE)',
          'Gaming 27" QHD (G2724D)',
          'S-Series 24" / 27" IPS',
          'Alienware 34" Curved OLED',
          "Other Dell Monitor",
        ],
      },
      {
        name: "BenQ",
        models: [
          "MOBIUZ EX2710S / EX2510S Gaming",
          "ZOWIE XL2546K 240Hz Esports",
          "GW2480 / GW2780 Eye-Care",
          "PD2700U Designer 4K",
          "Other BenQ Monitor",
        ],
      },
      {
        name: "ASUS",
        models: [
          "TUF Gaming VG279Q / VG249Q",
          "ROG Swift 360Hz / 240Hz",
          "ProArt PA278CV Professional",
          "Eye Care VA24EHE 24-inch",
          "Other ASUS Monitor",
        ],
      },
      {
        name: "Acer",
        models: [
          "Nitro VG240Y / VG270 Gaming",
          "Predator XB273U 240Hz",
          "EK240Y / SA240Y Slim",
          "Other Acer Monitor",
        ],
      },
      {
        name: "Other Brand",
        models: ["Other Model"],
      },
    ],
  },
  Printer: {
    brands: [
      {
        name: "Epson",
        models: [
          "EcoTank L3250 Wi-Fi All-in-One",
          "EcoTank L3210 All-in-One",
          "EcoTank L6270 Duplex Wi-Fi",
          "EcoTank L805 6-Colour Photo",
          "EcoTank L130 Single Function",
          "Other Epson Printer",
        ],
      },
      {
        name: "HP",
        models: [
          "Smart Tank 580 All-in-One Wi-Fi",
          "Smart Tank 520 All-in-One",
          "LaserJet Pro M126nw / M1005",
          "DeskJet 2331 / 2723 Colour",
          "LaserJet 1020 Plus",
          "Other HP Printer",
        ],
      },
      {
        name: "Canon",
        models: [
          "PIXMA G3010 Ink Tank Wi-Fi",
          "PIXMA G2020 Ink Tank",
          "imageCLASS LBP2900B Laser",
          "PIXMA E477 / E410 All-in-One",
          "imageCLASS MF3010 Multifunction Laser",
          "Other Canon Printer",
        ],
      },
      {
        name: "Brother",
        models: [
          "DCP-T420W Ink Tank Wi-Fi",
          "DCP-T520W / T820DW Auto Duplex",
          "HL-L2321D Monochrome Laser",
          "DCP-L2541DW Multifunction Laser",
          "Other Brother Printer",
        ],
      },
      {
        name: "Other Brand",
        models: ["Other Model"],
      },
    ],
  },
  Tablet: {
    brands: [
      {
        name: "Apple",
        models: [
          'iPad Pro 11" (M4 / M2)',
          'iPad Pro 12.9" (M2 / M1)',
          'iPad Air 11" / 13" (M2 / M1)',
          "iPad 10th Gen (10.9-inch)",
          "iPad 9th Gen (10.2-inch)",
          "iPad mini 6 (8.3-inch)",
          "Other Apple iPad",
        ],
      },
      {
        name: "Samsung",
        models: [
          "Galaxy Tab S9 Ultra / S9+",
          "Galaxy Tab S9 / S9 FE",
          "Galaxy Tab S8 / S8+",
          "Galaxy Tab S6 Lite",
          "Galaxy Tab A9+ / A9",
          "Other Samsung Galaxy Tab",
        ],
      },
      {
        name: "Xiaomi / Redmi",
        models: [
          "Xiaomi Pad 6 (Snapdragon 870)",
          "Xiaomi Pad 5",
          "Redmi Pad Pro 12.1",
          "Redmi Pad SE",
          "Other Xiaomi / Redmi Pad",
        ],
      },
      {
        name: "Lenovo",
        models: [
          "Tab P11 Pro / P12",
          "Tab M10 Plus (3rd Gen)",
          "Yoga Tab 11",
          "Tab M11",
          "Other Lenovo Tablet",
        ],
      },
      {
        name: "OnePlus",
        models: [
          "OnePlus Pad (Dimensity 9000)",
          "OnePlus Pad Go",
          "Other OnePlus Tablet",
        ],
      },
      {
        name: "Other Brand",
        models: ["Other Model"],
      },
    ],
  },
  Accessories: {
    brands: [
      {
        name: "Apple",
        models: [
          "AirPods Pro (2nd Gen USB-C)",
          "AirPods (3rd Gen)",
          "AirPods Max",
          "Apple Watch Series 9 / 8",
          "Apple Watch Ultra 2 / 1",
          "Magic Keyboard & Mouse",
          "Apple Pencil (USB-C / 2nd Gen)",
          "Other Apple Accessory",
        ],
      },
      {
        name: "Sony",
        models: [
          "WH-1000XM5 Wireless Headphones",
          "WH-1000XM4 Wireless Headphones",
          "WF-1000XM5 Noise Cancelling Earbuds",
          "PlayStation DualSense Wireless Controller",
          "SRS-XB Bluetooth Speaker",
          "Other Sony Accessory",
        ],
      },
      {
        name: "Logitech",
        models: [
          "MX Master 3S Wireless Mouse",
          "MX Keys Mini / Mechanical",
          "G Pro X Superlight Wireless Gaming Mouse",
          "G502 HERO High Performance Mouse",
          "G29 / G923 Driving Force Racing Wheel",
          "C920 / Brio 4K Webcam",
          "Other Logitech Accessory",
        ],
      },
      {
        name: "Razer",
        models: [
          "DeathAdder V3 Pro Wireless",
          "BlackWidow V4 Mechanical Keyboard",
          "Viper V2 Pro Wireless",
          "Kraken V3 Gaming Headset",
          "Other Razer Accessory",
        ],
      },
      {
        name: "Samsung",
        models: [
          "Galaxy Watch 6 / 6 Classic",
          "Galaxy Watch 5 Pro",
          "Galaxy Buds 2 Pro",
          "T7 Shield Portable SSD (1TB / 2TB)",
          "Other Samsung Accessory",
        ],
      },
      {
        name: "Other Brand",
        models: ["Other Model"],
      },
    ],
  },
  "Other Electronics": {
    brands: [
      {
        name: "Sony",
        models: [
          "PlayStation 5 (Disc / Digital)",
          "PlayStation 4 Pro (1TB)",
          "PlayStation 4 Slim",
          "Alpha A7 IV / A7 III Mirrorless Camera",
          "ZV-E10 Content Creator Camera",
          "Other Sony Device",
        ],
      },
      {
        name: "Microsoft",
        models: [
          "Xbox Series X 1TB",
          "Xbox Series S 512GB",
          "Xbox One X / One S",
          "Other Microsoft Device",
        ],
      },
      {
        name: "Nintendo",
        models: [
          "Nintendo Switch OLED Model",
          "Nintendo Switch (Standard)",
          "Nintendo Switch Lite",
          "Other Nintendo Device",
        ],
      },
      {
        name: "GoPro",
        models: [
          "HERO 12 Black Action Camera",
          "HERO 11 Black",
          "HERO 10 / 9 Black",
          "GoPro MAX 360",
          "Other GoPro Camera",
        ],
      },
      {
        name: "Canon / Nikon / DJI",
        models: [
          "Canon EOS R6 / R50 Mirrorless",
          "Canon EOS 1500D / 200D II DSLR",
          "Nikon Z50 / Z5 Mirrorless",
          "DJI Mini 4 Pro / Mini 3 Drone",
          "DJI Osmo Pocket 3 / Action 4",
          "Other Camera / Drone",
        ],
      },
      {
        name: "Other Brand",
        models: ["Other Device"],
      },
    ],
  },
}

export default function SellYourItem({
  onBackToFresh,
}: {
  onBackToFresh?: () => void
}) {
  const store = useStore()

  // ── RULE: Only logged-in users can use the sell product feature ──
  if (!store.loggedIn) {
    return (
      <LoginGate
        title="Sign in to sell your device"
        text="Please log in with your mobile number to submit devices for evaluation, upload bills, and receive valuation offers from IT HUB."
      />
    )
  }

  const [step, setStep] = useState(0) // 0: Category, 1: Details & Warranty, 2: Images & Documents, 3: Review
  const [submittedRequest, setSubmittedRequest] = useState<SellRequest | null>(
    null,
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  // Form State
  const [category, setCategory] = useState<SellCategory>("Phone")
  const categoryData = sellCatalog[category]

  // Dropdown states for Brand and Model
  const [selectedBrand, setSelectedBrand] = useState<string>(
    categoryData.brands[0]?.name || "Apple",
  )
  const [customBrand, setCustomBrand] = useState("")

  const currentBrandData =
    categoryData.brands.find((b) => b.name === selectedBrand) ||
    categoryData.brands[0]
  const [selectedModel, setSelectedModel] = useState<string>(
    currentBrandData?.models[0] || "Other Model",
  )
  const [customModel, setCustomModel] = useState("")

  // Automatically update brand and model dropdowns when Category changes
  useEffect(() => {
    const defaultBrand = sellCatalog[category].brands[0]?.name || "Other Brand"
    setSelectedBrand(defaultBrand)
    const brandObj = sellCatalog[category].brands.find(
      (b) => b.name === defaultBrand,
    )
    setSelectedModel(brandObj?.models[0] || "Other Model")
    setCustomBrand("")
    setCustomModel("")
  }, [category])

  // Automatically update model dropdown when Brand changes
  const handleBrandChange = (newBrand: string) => {
    setSelectedBrand(newBrand)
    const brandObj = sellCatalog[category].brands.find(
      (b) => b.name === newBrand,
    )
    const defaultModel = brandObj?.models[0] || "Other Model"
    setSelectedModel(defaultModel)
    setCustomModel("")
  }

  const [condition, setCondition] = useState<ProductCondition>("Good")
  const [description, setDescription] = useState("")
  const [hasWarranty, setHasWarranty] = useState<boolean | null>(null)
  const [warrantyProvider, setWarrantyProvider] = useState("")
  const [warrantyRemaining, setWarrantyRemaining] = useState("6 months")
  const [warrantyDetails, setWarrantyDetails] = useState("")
  const [expectedPrice, setExpectedPrice] = useState("")

  // Contact info (prefilled from profile)
  const [customerName, setCustomerName] = useState(store.profile.name || "")
  const [customerEmail, setCustomerEmail] = useState(store.profile.email || "")
  const [customerPhone, setCustomerPhone] = useState(store.profile.phone || "")

  // File uploads
  const [images, setImages] = useState<{
    name: string
    url: string
    size: number
  }[]>([])
  const [invoice, setInvoice] = useState<{
    name: string
    url: string
    size: number
  } | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const invoiceInputRef = useRef<HTMLInputElement>(null)

  // Derived effective brand and model strings
  const effectiveBrand =
    selectedBrand === "Other Brand" ? customBrand.trim() : selectedBrand
  const effectiveModel = selectedModel.startsWith("Other")
    ? customModel.trim() || selectedModel
    : selectedModel

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || !files.length) return
    setError("")

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"]
    const newImages: { name: string url: string size: number }[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!allowedTypes.includes(file.type)) {
        setError(
          `"${file.name}" is not a supported format. Please upload JPG, PNG, or WEBP images.`,
        )
        continue
      }
      if (file.size > 10 * 1024 * 1024) {
        setError(`"${file.name}" exceeds the 10MB size limit.`)
        continue
      }
      newImages.push({
        name: file.name,
        url: URL.createObjectURL(file),
        size: file.size,
      })
    }

    setImages((prev) => [...prev, ...newImages])
    if (imageInputRef.current) imageInputRef.current.value = ""
  }

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }

  const handleInvoiceUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || !files.length) return
    setError("")
    const file = files[0]

    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/jpg",
      "image/webp",
    ]
    if (!allowedTypes.includes(file.type)) {
      setError("Please upload an invoice in PDF, JPG, or PNG format.")
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      setError("Invoice file must be under 15MB.")
      return
    }

    setInvoice({
      name: file.name,
      url: URL.createObjectURL(file),
      size: file.size,
    })
    if (invoiceInputRef.current) invoiceInputRef.current.value = ""
  }

  const handleRemoveInvoice = () => {
    setInvoice(null)
  }

  const handleSubmit = async () => {
    setError("")
    if (!customerName || !customerPhone) {
      setError(
        "Please provide your name and phone number so IT HUB can contact you.",
      )
      return
    }
    if (!effectiveBrand) {
      setError("Please specify the brand of your device.")
      return
    }
    if (!effectiveModel) {
      setError("Please specify the model of your device.")
      return
    }
    if (hasWarranty && !invoice) {
      setError(
        "Since warranty remains, please upload the original bill/invoice for verification.",
      )
      return
    }
    if (!images.length) {
      setError("Please upload at least one photo of the device.")
      return
    }

    setSubmitting(true)
    setError("")

    try {
      const res = await submitSellRequest({
        userId: customerPhone,
        customerName,
        customerEmail: customerEmail || "unspecified@example.com",
        customerPhone,
        category,
        brand: effectiveBrand,
        model: effectiveModel,
        condition,
        description,
        hasWarranty: Boolean(hasWarranty),
        warrantyProvider: hasWarranty ? warrantyProvider : undefined,
        warrantyRemaining: hasWarranty ? warrantyRemaining : undefined,
        warrantyDetails: hasWarranty ? warrantyDetails : undefined,
        expectedPrice: expectedPrice ? Number(expectedPrice) : undefined,
        images: images.map((img) => ({ name: img.name, dataUrl: img.url })),
        invoice: invoice ? { name: invoice.name, dataUrl: invoice.url } : null,
      })

      const finalId = res.id || `SELL-${crypto.randomUUID().slice(0, 6).toUpperCase()}`
      const newRequest: SellRequest = {
        id: finalId,
        userId: customerPhone,
        customerName,
        customerEmail: customerEmail || "unspecified@example.com",
        customerPhone,
        category,
        productName:
          `${effectiveBrand} ${effectiveModel}`.trim() || `${category} device`,
        brand: effectiveBrand,
        model: effectiveModel,
        condition,
        description,
        hasWarranty: Boolean(hasWarranty),
        warrantyProvider: hasWarranty ? warrantyProvider : "",
        warrantyRemaining: hasWarranty ? warrantyRemaining : "",
        warrantyDetails: hasWarranty ? warrantyDetails : "",
        expectedPrice: expectedPrice ? Number(expectedPrice) : undefined,
        imagePaths: res.storageImages?.length ? res.storageImages : images.map((img) => img.url),
        invoicePath: res.storageInvoice || (invoice ? invoice.url : ""),
        status: "Pending",
        adminNotes: "",
        submittedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      store.set((prev) => ({
        sellRequests: [newRequest, ...prev.sellRequests],
        notifications: [`Sell request ${finalId} submitted`, ...prev.notifications],
      }))

      store.log(
        `Sell Request Submitted: ${finalId} (${category} - ${newRequest.productName})`,
      )
      store.notify(`Sell request ${finalId} submitted for review!`)
      setSubmittedRequest(newRequest)
    } catch (err: any) {
      setError(err?.message || "Failed to submit sell request. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  // Confirmation screen
  if (submittedRequest) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-white p-8 text-center shadow-sm md:p-12">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCircle2 size={44} />
        </div>
        <div className="mt-4">
          <Badge tone="green">REQUEST SUBMITTED</Badge>
        </div>
        <h2 className="mt-4 text-2xl font-bold text-foreground md:text-3xl">
          Your product has been submitted successfully.
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Our IT HUB evaluation team will review your item details and contact
          you shortly with an offer.
        </p>

        <div className="my-8 rounded-xl bg-muted/60 p-6 text-left">
          <div className="grid gap-3 text-xs sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">Request ID:</span>
              <p className="font-mono text-sm font-bold text-primary">
                {submittedRequest.id}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Status:</span>
              <p className="font-semibold text-amber-700">UNDER REVIEW</p>
            </div>
            <div>
              <span className="text-muted-foreground">Device:</span>
              <p className="font-medium">{submittedRequest.productName}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Category:</span>
              <p className="font-medium">{submittedRequest.category}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Condition:</span>
              <p className="font-medium">{submittedRequest.condition}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Warranty:</span>
              <p className="font-medium">
                {submittedRequest.hasWarranty
                  ? `Yes · ${submittedRequest.warrantyRemaining}`
                  : "No Warranty"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <Button
            onClick={() => {
              setSubmittedRequest(null)
              setStep(0)
              setImages([])
              setInvoice(null)
              setCustomBrand("")
              setCustomModel("")
              setDescription("")
              setHasWarranty(null)
            }}
          >
            Submit another item
          </Button>
          {onBackToFresh && (
            <Button variant="secondary" onClick={onBackToFresh}>
              Back to Fresh Products
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-white p-6 shadow-sm md:p-10">
      {/* Header & Flow Indicator */}
      <div className="mb-8 border-b border-border pb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                <BadgeIndianRupee size={13} /> SELL YOUR ITEM
              </span>
              <span className="text-xs text-muted-foreground">
                · Fast Evaluation & Payout
              </span>
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              Turn your old electronics into instant cash.
            </h2>
            <p className="mt-1 text-xs text-muted-foreground md:text-sm">
              Submit your phone, laptop, PC or gadget. IT HUB inspects and
              purchases directly from you.
            </p>
          </div>
          {onBackToFresh && (
            <button
              type="button"
              onClick={onBackToFresh}
              className="text-xs font-semibold text-primary hover:underline"
            >
              ← Back to Shop
            </button>
          )}
        </div>

        {/* Steps Breadcrumb */}
        <div className="mt-6 flex flex-wrap items-center gap-2 text-xs">
          {[
            "1. Select Category",
            "2. Brand, Model & Warranty",
            "3. Photos & Bill",
            "4. Contact & Review",
          ].map((title, idx) => (
            <button
              key={title}
              disabled={idx > step}
              onClick={() => setStep(idx)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
                step === idx
                  ? "bg-primary text-white"
                  : step > idx
                    ? "bg-muted text-foreground hover:bg-muted/80"
                    : "text-muted-foreground opacity-50"
              }`}
            >
              <span>{title}</span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-700">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* STEP 0: Category Selection */}
      {step === 0 && (
        <div>
          <h3 className="mb-4 text-base font-bold text-foreground">
            What device do you want to sell?
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {sellCategories.map((cat) => {
              const Icon = categoryIcons[cat]
              const isSelected = category === cat
              return (
                <button
                  type="button"
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`flex flex-col items-center justify-center rounded-xl border p-5 text-center transition ${
                    isSelected
                      ? "border-primary bg-primary/5 text-primary shadow-sm ring-2 ring-primary/20"
                      : "border-border bg-white text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  <Icon
                    size={32}
                    className={`mb-2.5 ${isSelected ? "text-primary" : ""}`}
                  />
                  <span className="text-xs font-semibold">{cat}</span>
                </button>
              )
            })}
          </div>

          <div className="mt-8 flex justify-end">
            <Button type="button" onClick={() => setStep(1)}>
              Continue to Details <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 1: Product Details & Warranty */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-foreground">
              Select your {category} brand and model
            </h3>
            <span className="text-xs text-muted-foreground">
              Category: <strong>{category}</strong>
            </span>
          </div>

          {/* Dynamic Brand and Model Dropdowns */}
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground">
                Brand *
              </label>
              <select
                value={selectedBrand}
                onChange={(e) => handleBrandChange(e.target.value)}
                className={fieldClass}
              >
                {categoryData.brands.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
              {selectedBrand === "Other Brand" && (
                <div className="mt-2">
                  <input
                    type="text"
                    required
                    placeholder="Type your brand name"
                    value={customBrand}
                    onChange={(e) => setCustomBrand(e.target.value)}
                    className={fieldClass}
                  />
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground">
                Model Name / Series *
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className={fieldClass}
              >
                {currentBrandData.models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              {selectedModel.startsWith("Other") && (
                <div className="mt-2">
                  <input
                    type="text"
                    required
                    placeholder="Type your exact model / specifications"
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    className={fieldClass}
                  />
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-foreground">
              Physical & Functional Condition *
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {productConditions.map((cond) => (
                <button
                  type="button"
                  key={cond}
                  onClick={() => setCondition(cond)}
                  className={`rounded-lg border px-3 py-2 text-center text-xs font-medium transition ${
                    condition === cond
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-white text-foreground hover:border-primary/40"
                  }`}
                >
                  {cond}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {condition === "New" &&
                "Unopened or unused in original packaging."}
              {condition === "Like New" &&
                "Flawless screen and body, no noticeable scratches or dents."}
              {condition === "Good" &&
                "Light cosmetic wear, fully functional with all features working."}
              {condition === "Fair" &&
                "Visible scuffs or scratches, but working properly."}
              {condition === "For Parts" &&
                "Damaged screen, battery or hardware issue; for scrap/parts."}
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-foreground">
              Additional Details / Faults / Included Accessories
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Includes original charger and box. Battery health 88%. No scratches on display."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={fieldClass}
            />
          </div>

          {/* Warranty Section */}
          <div className="rounded-xl border border-border bg-muted/40 p-5">
            <label className="mb-3 block text-xs font-semibold text-foreground">
              Does this item have active manufacturer or store warranty? *
            </label>
            <div className="grid grid-cols-2 gap-3 sm:max-w-md">
              <button
                type="button"
                onClick={() => setHasWarranty(true)}
                className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-bold transition ${
                  hasWarranty === true
                    ? "border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20"
                    : "border-border bg-white text-muted-foreground hover:border-border/80"
                }`}
              >
                <ShieldCheck size={16} className="text-emerald-600" />
                Yes, warranty remains
              </button>
              <button
                type="button"
                onClick={() => setHasWarranty(false)}
                className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-bold transition ${
                  hasWarranty === false
                    ? "border-amber-600 bg-amber-50 text-amber-800 ring-2 ring-amber-500/20"
                    : "border-border bg-white text-muted-foreground hover:border-border/80"
                }`}
              >
                No warranty / Expired
              </button>
            </div>

            {hasWarranty === true && (
              <div className="mt-5 space-y-4 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
                <p className="text-xs font-semibold text-emerald-900">
                  Warranty Information (Original invoice required in next step)
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-emerald-900">
                      Warranty Provider / Brand
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. AppleCare, HP Official, Reliance Digital"
                      value={warrantyProvider}
                      onChange={(e) => setWarrantyProvider(e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-emerald-900">
                      Approximate Warranty Remaining
                    </label>
                    <select
                      value={warrantyRemaining}
                      onChange={(e) => setWarrantyRemaining(e.target.value)}
                      className={fieldClass}
                    >
                      <option>Under 3 months</option>
                      <option>3 to 6 months</option>
                      <option>6 to 12 months</option>
                      <option>1 to 2 years</option>
                      <option>More than 2 years</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-emerald-900">
                    Warranty Notes or Serial Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Registered with Dell ProSupport, invoice available"
                    value={warrantyDetails}
                    onChange={(e) => setWarrantyDetails(e.target.value)}
                    className={fieldClass}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Expected Price / Asking Price */}
          <div className="rounded-xl border border-border bg-card p-4">
            <label className="mb-1.5 block text-xs font-semibold text-foreground">
              Your Expected Asking Price (₹) <span className="font-normal text-muted-foreground">(Optional)</span>
            </label>
            <div className="relative max-w-sm">
              <span className="absolute left-3 top-2 text-xs font-bold text-muted-foreground">₹</span>
              <input
                type="number"
                min={0}
                step={500}
                placeholder="e.g. 25000"
                value={expectedPrice}
                onChange={(e) => setExpectedPrice(e.target.value)}
                className={`${fieldClass} pl-7`}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              What do you hope to get for this device? IT HUB will evaluate condition and give you a fair market quote.
            </p>
          </div>

          <div className="flex justify-between pt-4">
            <Button variant="secondary" onClick={() => setStep(0)}>
              <ArrowLeft size={16} /> Back
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!effectiveBrand) {
                  setError("Please select or specify the brand.")
                  return
                }
                if (!effectiveModel) {
                  setError("Please select or specify the model.")
                  return
                }
                if (hasWarranty === null) {
                  setError(
                    "Please select whether the device has active warranty.",
                  )
                  return
                }
                setError("")
                setStep(2)
              }}
            >
              Continue to Uploads <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2: Photos & Documents Upload */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h3 className="text-base font-bold text-foreground">
              Upload Photos & Invoice
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Clear photos help us give you a faster and higher quote.
            </p>
          </div>

          {/* Product Photos */}
          <div className="rounded-xl border border-border p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-foreground">
                  Product Images * (Front, Back, Screen, Ports)
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Supported formats: JPG, PNG, WEBP (Max 10MB per image)
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => imageInputRef.current?.click()}
                className="px-3 py-1.5 text-xs"
              >
                <Upload size={14} /> Add Images
              </Button>
              <input
                ref={imageInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleImageUpload}
              />
            </div>

            {images.length > 0 ? (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {images.map((img, i) => (
                  <div
                    key={i}
                    className="group relative flex h-28 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/30"
                  >
                    <img
                      src={img.url}
                      alt={img.name}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(i)}
                      className="absolute right-1.5 top-1.5 rounded-full bg-red-600/90 p-1 text-white opacity-0 transition group-hover:opacity-100"
                    >
                      <X size={12} />
                    </button>
                    <span className="absolute bottom-1 left-1 max-w-[90%] truncate rounded bg-black/60 px-1 py-0.5 text-[9px] text-white">
                      {img.name}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div
                onClick={() => imageInputRef.current?.click()}
                className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-8 text-center transition hover:border-primary/50 hover:bg-muted/30"
              >
                <Upload size={28} className="text-muted-foreground" />
                <p className="mt-2 text-xs font-semibold text-foreground">
                  Click to select images of your device
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Upload 1 to 6 photos
                </p>
              </div>
            )}
          </div>

          {/* Invoice Upload: Mandatory if hasWarranty === true */}
          {hasWarranty && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-950">
                    <FileText size={14} className="text-emerald-700" />
                    Original Bill / Invoice * (Required for Warranty
                    Verification)
                  </p>
                  <p className="text-[11px] text-emerald-800">
                    PDF, JPG, or PNG. Private file — only IT HUB administrators
                    can view this.
                  </p>
                </div>
                {!invoice && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => invoiceInputRef.current?.click()}
                    className="border-emerald-300 bg-white px-3 py-1.5 text-xs text-emerald-900 hover:bg-emerald-100"
                  >
                    <Upload size={14} /> Upload Bill
                  </Button>
                )}
                <input
                  ref={invoiceInputRef}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleInvoiceUpload}
                />
              </div>

              {invoice ? (
                <div className="mt-4 flex items-center justify-between rounded-lg border border-emerald-300 bg-white p-3 text-xs text-emerald-950">
                  <div className="flex items-center gap-2">
                    <FileText size={18} className="text-emerald-600" />
                    <div>
                      <p className="font-semibold">{invoice.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {(invoice.size / 1024 / 1024).toFixed(2)} MB · Uploaded
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveInvoice}
                    className="text-xs font-semibold text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => invoiceInputRef.current?.click()}
                  className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-emerald-300 bg-white/70 p-6 text-center hover:bg-white"
                >
                  <FileText size={24} className="text-emerald-600" />
                  <p className="mt-2 text-xs font-semibold text-emerald-950">
                    Upload purchase receipt or GST tax invoice
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    PDF or high-res photo
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between pt-4">
            <Button variant="secondary" onClick={() => setStep(1)}>
              <ArrowLeft size={16} /> Back
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!images.length) {
                  setError("Please upload at least one image of your item.")
                  return
                }
                if (hasWarranty && !invoice) {
                  setError(
                    "Since warranty remains, please upload the original bill/invoice.",
                  )
                  return
                }
                setError("")
                setStep(3)
              }}
            >
              Continue to Review <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: Contact Info & Review */}
      {step === 3 && (
        <div className="space-y-6">
          <div>
            <h3 className="text-base font-bold text-foreground">
              Review & Submit Request
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Verify your details and tell us how to reach you with the
              valuation offer.
            </p>
          </div>

          {/* Contact Details */}
          <div className="rounded-xl border border-border bg-muted/30 p-5">
            <p className="mb-3 text-xs font-semibold text-foreground">
              Your Contact Information *
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-[11px] text-muted-foreground">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Your Name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className={fieldClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted-foreground">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="+91 9876543210"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className={fieldClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted-foreground">
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className={fieldClass}
                />
              </div>
            </div>
          </div>

          {/* Summary Card */}
          <div className="rounded-xl border border-border p-5">
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Device Summary
            </h4>
            <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
              <div>
                <span className="text-muted-foreground">Category</span>
                <p className="font-semibold text-foreground">{category}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Device</span>
                <p className="font-semibold text-foreground">
                  {effectiveBrand} {effectiveModel}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Condition</span>
                <p className="font-semibold text-foreground">{condition}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Warranty</span>
                <p className="font-semibold text-foreground">
                  {hasWarranty
                    ? `Active (${warrantyRemaining})`
                    : "No Warranty"}
                </p>
              </div>
              {expectedPrice && (
                <div>
                  <span className="text-muted-foreground">Expected Price</span>
                  <p className="font-semibold text-emerald-700">₹{Number(expectedPrice).toLocaleString("en-IN")}</p>
                </div>
              )}
            </div>
            {description && (
              <div className="mt-3 border-t border-border pt-3 text-xs">
                <span className="text-muted-foreground">Notes: </span>
                <span className="text-foreground">{description}</span>
              </div>
            )}
            <div className="mt-3 flex items-center gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
              <span>{images.length} photos uploaded</span>
              <span>·</span>
              <span>{invoice ? "Invoice attached" : "No invoice"}</span>
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <Button variant="secondary" onClick={() => setStep(2)}>
              <ArrowLeft size={16} /> Back
            </Button>
            <Button type="button" disabled={submitting} onClick={handleSubmit}>
              {submitting
                ? "Submitting for Review…"
                : "Submit Device for Valuation"}
              <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
