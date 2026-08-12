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
import { disconnectOAuthProvider, getNousPortalIdentity, listOAuthProviders } from '@/hermes'
import { useI18n } from '@/i18n'
import { Loader2, LogIn, PawPrint, Settings } from '@/lib/icons'
import { notify, notifyError } from '@/store/notifications'
import { startManualProviderOAuth } from '@/store/onboarding'
import { $petInfo } from '@/store/pet'
import { $petGallery, loadPetGallery, setPetEnabled } from '@/store/pet-gallery'
import type { NousPortalIdentity } from '@/types/hermes'

type AccountIdentity = Pick<DesktopCloudAccount, 'displayName' | 'email'>

const EMPTY_ACCOUNT_IDENTITY: AccountIdentity = { displayName: null, email: null }
const EMPTY_PROVIDER_ACCOUNT_IDENTITY: NousPortalIdentity = { display_name: null, email: null }

/**
 * The sidebar's persistent Nous account affordance. A saved `nous` provider
 * credential is the source of truth for the active Hermes profile; a Portal
 * browser session is retained as a Cloud-only fallback.
 */
export function SidebarAccountMenu() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { requestGateway } = useGatewayRequest()
  const petCopy = t.settings.appearance.pet
  const gallery = useStore($petGallery)
  const petInfo = useStore($petInfo)
  const [menuOpen, setMenuOpen] = useState(false)
  const [portalSignedIn, setPortalSignedIn] = useState(false)
  const [providerSignedIn, setProviderSignedIn] = useState(false)
  const [accountIdentity, setAccountIdentity] = useState<AccountIdentity>(EMPTY_ACCOUNT_IDENTITY)
  const [accountPending, setAccountPending] = useState(false)
  const accountPendingRef = useRef(false)
  const accountStatusSequence = useRef(0)

  const petEnabled = gallery?.enabled ?? petInfo.enabled
  const accountSignedIn = portalSignedIn || providerSignedIn

  const accountName = accountSignedIn
    ? accountIdentity.displayName || accountIdentity.email || 'Nous Research'
    : 'Nous Research'

  const accountInitial = accountName.trim().charAt(0).toUpperCase() || 'N'

  const accountDetail =
    accountSignedIn && accountIdentity.email && accountIdentity.email !== accountName
      ? accountIdentity.email
      : accountSignedIn
        ? t.settings.gateway.signedIn
        : 'Not signed in'

  const refreshAccountStatus = useCallback(async () => {
    if (accountPendingRef.current) {
      return
    }

    const requestSequence = ++accountStatusSequence.current
    const cloud = window.hermesDesktop?.cloud

    const [portalStatus, providers] = await Promise.allSettled([
      Promise.resolve().then(() => (cloud ? cloud.status() : { signedIn: false })),
      Promise.resolve().then(() => listOAuthProviders())
    ])

    if (requestSequence !== accountStatusSequence.current) {
      return
    }

    const nextPortalSignedIn = portalStatus.status === 'fulfilled' && portalStatus.value.signedIn

    const nextProviderSignedIn =
      providers.status === 'fulfilled' &&
      Boolean(providers.value.providers.find(provider => provider.id === 'nous')?.status.logged_in)

    setPortalSignedIn(nextPortalSignedIn)
    setProviderSignedIn(nextProviderSignedIn)

    const portalIdentityRequest =
      nextPortalSignedIn && cloud && typeof cloud.account === 'function'
        ? cloud.account()
        : Promise.resolve(EMPTY_ACCOUNT_IDENTITY)

    const providerIdentityRequest = nextProviderSignedIn
      ? getNousPortalIdentity()
      : Promise.resolve(EMPTY_PROVIDER_ACCOUNT_IDENTITY)

    const [portalIdentity, providerIdentity] = await Promise.allSettled([
      portalIdentityRequest,
      providerIdentityRequest
    ])

    if (requestSequence !== accountStatusSequence.current) {
      return
    }

    const cloudIdentity = portalIdentity.status === 'fulfilled' ? portalIdentity.value : EMPTY_ACCOUNT_IDENTITY

    const localIdentity =
      providerIdentity.status === 'fulfilled' ? providerIdentity.value : EMPTY_PROVIDER_ACCOUNT_IDENTITY

    // The saved provider credential belongs to the active Hermes profile, so
    // prefer it over a shared browser session when both are present.
    setAccountIdentity({
      displayName: localIdentity.display_name || cloudIdentity.displayName,
      email: localIdentity.email || cloudIdentity.email
    })
  }, [])

  useEffect(() => {
    void refreshAccountStatus()

    const onWindowFocus = () => void refreshAccountStatus()
    window.addEventListener('focus', onWindowFocus)

    return () => window.removeEventListener('focus', onWindowFocus)
  }, [refreshAccountStatus])

  const handleMenuOpenChange = useCallback(
    (open: boolean) => {
      setMenuOpen(open)

      if (open) {
        void refreshAccountStatus()
      }
    },
    [refreshAccountStatus]
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

  const toggleAccountSession = useCallback(async () => {
    if (!accountSignedIn) {
      setMenuOpen(false)
      startManualProviderOAuth('nous', null)

      return
    }

    const cloud = window.hermesDesktop?.cloud
    const mutationSequence = ++accountStatusSequence.current
    accountPendingRef.current = true
    setAccountPending(true)

    try {
      const results = await Promise.allSettled([
        providerSignedIn ? disconnectOAuthProvider('nous') : Promise.resolve(),
        Promise.resolve().then(() => (portalSignedIn && cloud ? cloud.logout() : { signedIn: false }))
      ])

      if (mutationSequence !== accountStatusSequence.current) {
        return
      }

      const [providerResult, portalResult] = results
      const providerFailed = providerResult.status === 'rejected'
      const portalFailed = portalResult.status === 'rejected'

      if (!providerFailed) {
        setProviderSignedIn(false)
      }

      if (!portalFailed) {
        const nextPortalSignedIn =
          portalResult.status === 'fulfilled' && 'signedIn' in portalResult.value ? portalResult.value.signedIn : false

        setPortalSignedIn(nextPortalSignedIn)

        if (!nextPortalSignedIn) {
          setAccountIdentity(EMPTY_ACCOUNT_IDENTITY)
        }
      }

      if (!providerFailed && !portalFailed) {
        notify({
          kind: 'success',
          title: t.settings.gateway.cloudSignedOutTitle,
          message: t.settings.gateway.cloudSignedOutMessage
        })

        return
      }

      if (providerResult.status === 'rejected') {
        throw providerResult.reason
      }

      if (portalResult.status === 'rejected') {
        throw portalResult.reason
      }
    } catch (error) {
      notifyError(error, t.settings.gateway.signOutFailed)
    } finally {
      accountPendingRef.current = false
      setAccountPending(false)
    }
  }, [accountSignedIn, portalSignedIn, providerSignedIn, t.settings.gateway])

  return (
    <SidebarFooter className="shrink-0 gap-0 border-t border-(--sidebar-edge-border) bg-transparent px-2.5 py-2">
      <DropdownMenu onOpenChange={handleMenuOpenChange} open={menuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="Nous Research account"
            className="h-9 w-full justify-start gap-2 rounded-lg border border-(--ui-stroke-tertiary) bg-transparent px-2 text-left text-xs font-medium text-foreground shadow-none transition-colors duration-150 hover:bg-(--ui-control-hover-background) data-[state=open]:bg-(--ui-control-hover-background)"
            size="sm"
            variant="ghost"
          >
            <span
              aria-hidden="true"
              className="grid size-5 shrink-0 place-items-center rounded-full bg-(--ui-bg-quinary) text-[0.625rem] font-semibold text-(--ui-text-secondary)"
            >
              {accountInitial}
            </span>
            <span className="min-w-0 flex-1 truncate">{accountName}</span>
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 rounded-full bg-(--ui-text-quaternary) data-[signed-in=true]:bg-emerald-500"
              data-signed-in={accountSignedIn}
            />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-60 p-1.5" side="top" sideOffset={8}>
          <DropdownMenuLabel className="flex items-center gap-2 px-2.5 py-2">
            <span
              aria-hidden="true"
              className="grid size-7 shrink-0 place-items-center rounded-full bg-(--ui-control-active-background) text-xs font-semibold text-foreground"
            >
              {accountInitial}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium text-foreground">{accountName}</span>
              <span className="block truncate pt-0.5 text-[0.6875rem] font-normal text-(--ui-text-tertiary)">
                {accountDetail}
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

          <DropdownMenuItem disabled={accountPending} onSelect={() => void toggleAccountSession()}>
            {accountPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <LogIn className={accountSignedIn ? 'rotate-180' : undefined} />
            )}
            {accountSignedIn ? t.settings.gateway.signOut : t.settings.gateway.signInWith('Nous Research')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarFooter>
  )
}
