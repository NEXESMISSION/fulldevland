import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

interface DialogContextType {
  open: boolean
  setOpen: (open: boolean) => void
}

const DialogContext = React.createContext<DialogContextType | undefined>(undefined)

interface DialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

function Dialog({ open: controlledOpen, onOpenChange, children }: DialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  
  const setOpen = React.useCallback((newOpen: boolean) => {
    if (onOpenChange) {
      onOpenChange(newOpen)
    } else {
      setUncontrolledOpen(newOpen)
    }
  }, [onOpenChange])

  // Lock body scroll when dialog is open (mobile fix)
  React.useEffect(() => {
    if (open) {
      // Save current scroll position for both window and main container
      const scrollY = window.scrollY
      const mainElement = document.querySelector('main')
      const mainScrollTop = mainElement?.scrollTop || 0
      
      // Lock body scroll - mobile-friendly approach
      const originalStyle = window.getComputedStyle(document.body).overflow
      const originalPosition = window.getComputedStyle(document.body).position
      const originalTop = window.getComputedStyle(document.body).top
      const originalWidth = window.getComputedStyle(document.body).width
      
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.top = `-${scrollY}px`
      document.body.style.width = '100%'
      
      // Also lock main container scroll if it exists
      if (mainElement) {
        const mainOriginalOverflow = window.getComputedStyle(mainElement).overflow
        mainElement.style.overflow = 'hidden'
        
        return () => {
          // Restore body styles
          document.body.style.overflow = originalStyle
          document.body.style.position = originalPosition
          document.body.style.top = originalTop
          document.body.style.width = originalWidth
          
          // Restore main container styles
          if (mainElement) {
            mainElement.style.overflow = mainOriginalOverflow
            mainElement.scrollTop = mainScrollTop
          }
          
          // Restore window scroll position
          window.scrollTo(0, scrollY)
        }
      } else {
        return () => {
          // Restore body styles
          document.body.style.overflow = originalStyle
          document.body.style.position = originalPosition
          document.body.style.top = originalTop
          document.body.style.width = originalWidth
          
          // Restore window scroll position
          window.scrollTo(0, scrollY)
        }
      }
    }
  }, [open])

  return (
    <DialogContext.Provider value={{ open, setOpen }}>
      {children}
    </DialogContext.Provider>
  )
}

function DialogTrigger({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) {
  const context = React.useContext(DialogContext)
  if (!context) throw new Error("DialogTrigger must be used within Dialog")

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ onClick?: () => void }>, {
      onClick: () => context.setOpen(true),
    })
  }

  return (
    <button onClick={() => context.setOpen(true)} type="button">
      {children}
    </button>
  )
}

function DialogPortal({ children }: { children: React.ReactNode }) {
  const context = React.useContext(DialogContext)
  if (!context) throw new Error("DialogPortal must be used within Dialog")
  if (!context.open) return null
  return <>{children}</>
}

function DialogOverlay({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const context = React.useContext(DialogContext)
  if (!context) throw new Error("DialogOverlay must be used within Dialog")

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className
      )}
      onClick={() => context.setOpen(false)}
      {...props}
    />
  )
}

const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const context = React.useContext(DialogContext)
  if (!context) throw new Error("DialogContent must be used within Dialog")

  if (!context.open) return null

  // Check if this is a notification dialog (has data-notification attribute)
  const isNotificationDialog = className?.includes('notification-dialog')
  
  return (
    <DialogPortal>
      <DialogOverlay />
      <div className={cn(
        "fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4",
        isNotificationDialog && "md:items-start md:justify-start md:left-[16rem] md:right-auto md:top-4 md:inset-auto md:p-0"
      )}>
        <div
          ref={ref}
          className={cn(
            "relative w-full max-w-[95vw] sm:max-w-lg md:max-w-2xl lg:max-w-3xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden border bg-background shadow-lg duration-200 rounded-lg flex flex-col",
            className
          )}
          {...props}
        >
          {/* Content with balanced padding - responsive for mobile */}
          <div className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-5 md:p-6 lg:p-8">
            {children}
          </div>
        </div>
      </div>
    </DialogPortal>
  )
})
DialogContent.displayName = "DialogContent"

const DialogHeader = ({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  const context = React.useContext(DialogContext)
  if (!context) throw new Error("DialogHeader must be used within Dialog")
  
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 sm:gap-4 pb-3 sm:pb-4 md:pb-5",
        className
      )}
      {...props}
    >
      {/* Title and subtitle container - takes available space */}
      <div className="flex-1 min-w-0 flex flex-col space-y-1 sm:space-y-1.5 text-right">
        {children}
      </div>
      
      {/* Close button - fixed on the right side with proper separation */}
      <button
        className="rounded-full bg-red-500 hover:bg-red-600 active:bg-red-700 text-white transition-all focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:pointer-events-none p-2 sm:p-2.5 flex items-center justify-center shadow-lg shrink-0 hover:scale-110 active:scale-95 touch-manipulation"
        onClick={() => context.setOpen(false)}
        type="button"
        aria-label="إغلاق"
      >
        <X className="h-4 w-4 sm:h-5 sm:w-5" />
      </button>
    </div>
  )
}
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn(
      "text-base sm:text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = "DialogTitle"

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = "DialogDescription"

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
