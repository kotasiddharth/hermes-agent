import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import { useGatewayRequest } from '@/app/gateway/hooks/use-gateway-request'
import { SETTINGS_ROUTE } from '@/app/routes'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { SidebarFooter } from '@/components/ui/sidebar'
import { useI18n } from '@/i18n'
import { Loader2, LogIn, PawPrint, Settings } from '@/lib/icons'
import { notify, notifyError } from '@/store/notifications'
import { $petInfo } from '@/store/pet'
import { $petGallery, loadPetGallery, setPetEnabled } from '@/store/pet-gallery'

/**
 * The sidebar's persistent account affordance. The Portal session is desktop
 * shell state rather than a model-provider credential, so this intentionally
 * uses `desktop.cloud` instead of the provider OAuth catalog.
 */
export function SidebarAccountMenu() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { requestGateway } = useGatewayRequest()
  const petCopy = t.settings.appearance.pet
  const gallery = useStore($petGallery)
  const petInfo = useStore($petInfo)
  const [menuOpen, setMenuOpen] = useState(false)
  const [cloudSignedIn, setCloudSignedIn] = useState(false)
  const [cloudPending, setCloudPending] = useState(false)
  const cloudPendingRef = useRef(false)
  const cloudStatusSequence = useRef(0)

  const petEnabled = gallery?.enabled ?? petInfo.enabled
  const cloudAvailable = typeof window !== 'undefined' && Boolean(window.hermesDesktop?.cloud)

  const refreshCloudStatus = useCallback(async () => {
    if (cloudPendingRef.current) {
      return
    }

    const requestSequence = ++cloudStatusSequence.current
    const cloud = window.hermesDesktop?.cloud

    if (!cloud) {
      if (requestSequence === cloudStatusSequence.current) {
        setCloudSignedIn(false)
      }

      return
    }

    try {
      const status = await cloud.status()

      if (requestSequence === cloudStatusSequence.current) {
        setCloudSignedIn(status.signedIn)
      }
    } catch {
      // A missing/older desktop bridge should keep the rest of the footer
      // usable. The auth item is disabled rather than presenting stale state.
      if (requestSequence === cloudStatusSequence.current) {
        setCloudSignedIn(false)
      }
    }
  }, [])

  useEffect(() => {
    void refreshCloudStatus()

    const onWindowFocus = () => void refreshCloudStatus()
    window.addEventListener('focus', onWindowFocus)

    return () => window.removeEventListener('focus', onWindowFocus)
  }, [refreshCloudStatus])

  const handleMenuOpenChange = useCallback(
    (open: boolean) => {
      setMenuOpen(open)

      if (open) {
        void refreshCloudStatus()
      }
    },
    [refreshCloudStatus]
  )

  const togglePet = useCallback(async () => {
    const next = !petEnabled

    // The gallery is lazy-loaded elsewhere. Resolve it before toggling so an
    // installed pet can be shown or hidden even if Settings has not been
    // visited yet.
    if (!gallery) {
      await loadPetGallery(requestGateway)
    }

    if (!$petGallery.get()) {
      notify({
        kind: 'warning',
        title: 'No pet available',
        message: petCopy.noneAvailable
      })

      return
    }

    const changed = await setPetEnabled(requestGateway, next, {
      noneAvailable: petCopy.noneAvailable,
      fallback: next ? petCopy.turnOnFailed : petCopy.turnOffFailed
    })

    if (!changed && next) {
      notify({
        kind: 'warning',
        title: 'No pet available',
        message: petCopy.noneAvailable
      })
    }
  }, [gallery, petCopy, petEnabled, requestGateway])

  const toggleCloudSession = useCallback(async () => {
    const cloud = window.hermesDesktop?.cloud

    if (!cloud) {
      return
    }

    const mutationSequence = ++cloudStatusSequence.current
    cloudPendingRef.current = true
    setCloudPending(true)

    try {
      const result = cloudSignedIn ? await cloud.logout() : await cloud.login()

      if (mutationSequence !== cloudStatusSequence.current) {
        return
      }

      setCloudSignedIn(result.signedIn)

      if (cloudSignedIn && !result.signedIn) {
        notify({
          kind: 'success',
          title: t.settings.gateway.cloudSignedOutTitle,
          message: t.settings.gateway.cloudSignedOutMessage
        })
      }
    } catch (error) {
      notifyError(error, cloudSignedIn ? t.settings.gateway.signOutFailed : t.settings.gateway.cloudSignInFailed)
    } finally {
      cloudPendingRef.current = false
      setCloudPending(false)
    }
  }, [cloudSignedIn, t.settings.gateway])

  return (
    <SidebarFooter className="shrink-0 gap-0 border-t border-(--sidebar-edge-border) bg-transparent px-2.5 py-2">
      <DropdownMenu onOpenChange={handleMenuOpenChange} open={menuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="Nous Research account"
            className="h-9 w-full justify-start gap-2 rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-control-active-background) px-2 text-left text-xs font-medium text-foreground shadow-none transition-colors duration-150 hover:bg-(--ui-control-hover-background) data-[state=open]:bg-(--ui-control-hover-background)"
            size="sm"
            variant="ghost"
          >
            <span
              aria-hidden="true"
              className="grid size-5 shrink-0 place-items-center rounded-full bg-(--ui-bg-quinary) text-[0.625rem] font-semibold text-(--ui-text-secondary)"
            >
              N
            </span>
            <span className="min-w-0 flex-1 truncate">Nous Research</span>
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 rounded-full bg-(--ui-text-quaternary) data-[signed-in=true]:bg-emerald-500"
              data-signed-in={cloudSignedIn}
            />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-60 p-1.5" side="top" sideOffset={8}>
          <DropdownMenuLabel className="flex items-center gap-2 px-2.5 py-2">
            <span
              aria-hidden="true"
              className="grid size-7 shrink-0 place-items-center rounded-full bg-(--ui-control-active-background) text-xs font-semibold text-foreground"
            >
              N
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium text-foreground">Nous Research</span>
              <span className="block truncate pt-0.5 text-[0.6875rem] font-normal text-(--ui-text-tertiary)">
                {cloudSignedIn ? t.settings.gateway.signedIn : 'Not signed in'}
              </span>
            </span>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuItem onSelect={() => void togglePet()}>
            <PawPrint />
            {petEnabled ? 'Hide pet' : 'Show pet'}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate(SETTINGS_ROUTE)}>
            <Settings />
            Settings
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem disabled={!cloudAvailable || cloudPending} onSelect={() => void toggleCloudSession()}>
            {cloudPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <LogIn className={cloudSignedIn ? 'rotate-180' : undefined} />
            )}
            {cloudSignedIn ? t.settings.gateway.signOut : t.settings.gateway.signInWith('Nous Research')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarFooter>
  )
}
