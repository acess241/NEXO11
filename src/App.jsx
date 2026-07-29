import React, { Suspense, lazy, useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { aplicarTema, obterTemaSalvo } from './lib/theme'

import ProtectedRoute from './components/ProtectedRoute'
import PullToRefresh from './components/PullToRefresh'
import SocialLoader from './components/SocialLoader'
import NotificationBridge from './components/NotificationBridge'
import UpdateAnnouncement from './components/UpdateAnnouncement'

const Auth = lazy(() => import('./pages/Auth'))
const Feed = lazy(() => import('./pages/Feed'))
const SearchUsers = lazy(() => import('./pages/SearchUsers'))
const Profile = lazy(() => import('./pages/Profile'))
const UserProfile = lazy(() => import('./pages/UserProfile'))
const Notifications = lazy(() => import('./pages/Notifications'))
const NotificationSettings = lazy(() => import('./pages/NotificationSettings'))
const EditProfile = lazy(() => import('./pages/EditProfile'))
const CreatePost = lazy(() => import('./pages/CreatePost'))
const CreateStory = lazy(() => import('./pages/CreateStory'))
const NexisFeed = lazy(() => import('./pages/NexisFeed'))
const MessagesInbox = lazy(() => import('./pages/MessagesInbox'))
const ChatRoom = lazy(() => import('./pages/ChatRoom'))
const NexinhoRoom = lazy(() => import('./pages/NexinhoRoom'))
const LiveConversationRoom = lazy(() => import('./pages/LiveConversationRoom'))
const CreateGroup = lazy(() => import('./pages/CreateGroup'))
const GroupRoom = lazy(() => import('./pages/GroupRoom'))
const Connections = lazy(() => import('./pages/Connections'))
const Academy = lazy(() => import('./pages/Academy'))
const XpCenter = lazy(() => import('./pages/XpCenter'))
const ActivityLink = lazy(() => import('./pages/ActivityLink'))
const OxenteHub = lazy(() => import('./pages/OxenteHub'))
const BlockedProfiles = lazy(() => import('./pages/BlockedProfiles'))
const LikedPosts = lazy(() => import('./pages/LikedPosts'))
const CommentedPosts = lazy(() => import('./pages/CommentedPosts'))
const PrivacyCenter = lazy(() => import('./pages/PrivacyCenter'))
const PrivacyPolicy = lazy(() => import('./pages/LegalDocuments').then((module) => ({ default: module.PrivacyPolicy })))
const TermsOfUse = lazy(() => import('./pages/LegalDocuments').then((module) => ({ default: module.TermsOfUse })))
const SafetyResponsibilityTerms = lazy(() => import('./pages/LegalDocuments').then((module) => ({ default: module.SafetyResponsibilityTerms })))

function PageLoader() {
  return <SocialLoader variant="feed" />
}

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    aplicarTema(obterTemaSalvo())
  }, [])

  useEffect(() => {
    let ativo = true

    async function validarSessaoRemota(sessaoCandidata) {
      if (!sessaoCandidata) return null

      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser()

        if (error || !user) return null
        if (sessaoCandidata?.user?.id && user.id !== sessaoCandidata.user.id) return null
        return sessaoCandidata
      } catch {
        return null
      }
    }

    async function limparSessaoInvalida() {
      try {
        await supabase.auth.signOut({ scope: 'local' })
      } catch {}

      if (ativo) {
        setSession(null)
      }
    }

    async function carregarSessaoInicial() {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (error) throw error
        if (!ativo) return

        const sessaoLocal = data?.session || null
        const sessaoValida = await validarSessaoRemota(sessaoLocal)

        if (!ativo) return

        if (!sessaoValida && sessaoLocal) {
          await limparSessaoInvalida()
          return
        }

        setSession(sessaoValida)
      } catch {
        if (!ativo) return
        setSession(null)
      } finally {
        if (ativo) {
          setLoading(false)
        }
      }
    }

    void carregarSessaoInicial()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!ativo) return

      if (event === 'INITIAL_SESSION') {
        return
      }

      if (!session) {
        setSession(null)
        setLoading(false)
        return
      }

      window.setTimeout(async () => {
        if (!ativo) return

        const sessaoValida = await validarSessaoRemota(session)
        if (!ativo) return

        if (!sessaoValida) {
          await limparSessaoInvalida()
          setLoading(false)
          return
        }

        setSession(sessaoValida)
        setLoading(false)
      }, 0)
    })

    return () => {
      ativo = false
      subscription.unsubscribe()
    }
  }, [])

  if (loading) {
    return <SocialLoader variant="feed" />
  }

  return (
    <>
      <PullToRefresh />
      <NotificationBridge session={session} />
      <UpdateAnnouncement session={session} />

      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route
            path="/auth"
            element={!session ? <Auth /> : <Navigate to="/" replace />}
          />

          <Route path="/reset-senha" element={<Auth forceRecoveryMode />} />
          <Route path="/adicionar-conta" element={<Auth allowAddAccount />} />
          <Route path="/privacidade" element={<PrivacyPolicy />} />
          <Route path="/termos" element={<TermsOfUse />} />
          <Route path="/seguranca-responsabilidade" element={<SafetyResponsibilityTerms />} />

          <Route
            path="/"
            element={
              <ProtectedRoute session={session}>
                <Feed />
              </ProtectedRoute>
            }
          />

          <Route
            path="/pesquisar"
            element={
              <ProtectedRoute session={session}>
                <SearchUsers />
              </ProtectedRoute>
            }
          />

          <Route
            path="/nexis"
            element={
              <ProtectedRoute session={session}>
                <NexisFeed />
              </ProtectedRoute>
            }
          />

          <Route
            path="/perfil"
            element={
              <ProtectedRoute session={session}>
                <Profile />
              </ProtectedRoute>
            }
          />

          <Route
            path="/usuario/:username"
            element={
              <ProtectedRoute session={session}>
                <UserProfile />
              </ProtectedRoute>
            }
          />

          <Route
            path="/notificacoes"
            element={
              <ProtectedRoute session={session}>
                <Notifications />
              </ProtectedRoute>
            }
          />

          <Route
            path="/configuracoes/notificacoes"
            element={
              <ProtectedRoute session={session}>
                <NotificationSettings />
              </ProtectedRoute>
            }
          />

          <Route
            path="/mensagens"
            element={
              <ProtectedRoute session={session}>
                <MessagesInbox />
              </ProtectedRoute>
            }
          />

          <Route
            path="/mensagens/:username"
            element={
              <ProtectedRoute session={session}>
                <ChatRoom />
              </ProtectedRoute>
            }
          />

          <Route
            path="/nexinho/:conversationId"
            element={
              <ProtectedRoute session={session}>
                <NexinhoRoom />
              </ProtectedRoute>
            }
          />

          <Route
            path="/mensagens/ao-vivo/:conversationId"
            element={
              <ProtectedRoute session={session}>
                <LiveConversationRoom />
              </ProtectedRoute>
            }
          />

          <Route
            path="/mensagens/grupos/novo"
            element={
              <ProtectedRoute session={session}>
                <CreateGroup />
              </ProtectedRoute>
            }
          />

          <Route
            path="/mensagens/grupos/:groupId"
            element={
              <ProtectedRoute session={session}>
                <GroupRoom />
              </ProtectedRoute>
            }
          />

          <Route
            path="/grupos/novo"
            element={
              <ProtectedRoute session={session}>
                <CreateGroup />
              </ProtectedRoute>
            }
          />
          <Route
            path="/grupos/:groupId"
            element={
              <ProtectedRoute session={session}>
                <GroupRoom />
              </ProtectedRoute>
            }
          />

          <Route
            path="/conexoes"
            element={
              <ProtectedRoute session={session}>
                <Connections />
              </ProtectedRoute>
            }
          />

          <Route
            path="/bloqueados"
            element={
              <ProtectedRoute session={session}>
                <BlockedProfiles />
              </ProtectedRoute>
            }
          />

          <Route
            path="/curtidos"
            element={
              <ProtectedRoute session={session}>
                <LikedPosts />
              </ProtectedRoute>
            }
          />

          <Route
            path="/comentados"
            element={
              <ProtectedRoute session={session}>
                <CommentedPosts />
              </ProtectedRoute>
            }
          />

          <Route
            path="/academia"
            element={
              <ProtectedRoute session={session}>
                <Academy />
              </ProtectedRoute>
            }
          />
          <Route
            path="/academia/xp"
            element={
              <ProtectedRoute session={session}>
                <XpCenter />
              </ProtectedRoute>
            }
          />
          <Route
            path="/academia/atividade/:shareToken"
            element={
              <ProtectedRoute session={session}>
                <ActivityLink />
              </ProtectedRoute>
            }
          />

          <Route
            path="/oxente"
            element={
              <ProtectedRoute session={session}>
                <OxenteHub />
              </ProtectedRoute>
            }
          />

          <Route
            path="/editar-perfil"
            element={
              <ProtectedRoute session={session}>
                <EditProfile />
              </ProtectedRoute>
            }
          />

          <Route
            path="/central-de-privacidade"
            element={
              <ProtectedRoute session={session}>
                <PrivacyCenter />
              </ProtectedRoute>
            }
          />

          <Route
            path="/novo-story"
            element={
              <ProtectedRoute session={session}>
                <CreateStory />
              </ProtectedRoute>
            }
          />

          <Route
            path="/novo-post"
            element={
              <ProtectedRoute session={session}>
                <CreatePost />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  )
}
