import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Spin, message, Tooltip, Empty, Badge, Space, Typography } from 'antd'
const { Text } = Typography
import {
  PhoneOutlined,
  ToolOutlined,
  ShoppingCartOutlined,
  ClusterOutlined,
  SettingOutlined,
  PlayCircleOutlined,
  ArrowRightOutlined,
  ThunderboltOutlined,
  DeleteOutlined,
  SaveOutlined,
  AppstoreOutlined,
  PlusOutlined,
} from '@ant-design/icons'

interface ScenarioMeta {
  type: string
  label: string
  description: string
  icon: string
}

interface SavedScenario {
  name: string
  type: string
  config: any
  created_at: string
}

const ICON_MAP: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  PhoneOutlined:         { icon: <PhoneOutlined />,         color: '#2563eb', bg: '#eff6ff' },
  ToolOutlined:          { icon: <ToolOutlined />,           color: '#10b981', bg: '#ecfdf5' },
  ShoppingCartOutlined:  { icon: <ShoppingCartOutlined />,   color: '#f59e0b', bg: '#fffbeb' },
  ClusterOutlined:       { icon: <ClusterOutlined />,        color: '#8b5cf6', bg: '#f5f3ff' },
  SettingOutlined:       { icon: <SettingOutlined />,        color: '#06b6d4', bg: '#ecfeff' },
}

const STAGGER = ['fade-up-1', 'fade-up-2', 'fade-up-3', 'fade-up-4', 'fade-up-5', 'fade-up-6']

export default function HomePage() {
  const [scenarios, setScenarios] = useState<ScenarioMeta[]>([])
  const [library, setLibrary]     = useState<SavedScenario[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null)
  const navigate = useNavigate()

  const fetchAll = async () => {
    try {
      const base = import.meta.env.VITE_API_BASE ?? 'http://localhost:8002'
      const [resScen, resLib] = await Promise.all([
        fetch(`${base}/scenarios/`),
        fetch(`${base}/scenarios/library`),
      ])
      if (!resScen.ok || !resLib.ok) throw new Error('Errore nel caricamento dati')
      setScenarios(await resScen.json())
      setLibrary(await resLib.json())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Errore sconosciuto')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_BASE ?? 'http://localhost:8002'}/health`)
        setBackendOnline(res.ok)
      } catch { setBackendOnline(false) }
    }
    checkHealth()
    fetchAll()
    const id = setInterval(checkHealth, 15000)
    return () => clearInterval(id)
  }, [])

  const handleDeleteSaved = async (name: string) => {
    if (!window.confirm(`Eliminare "${name}"?`)) return
    try {
      const base = import.meta.env.VITE_API_BASE ?? 'http://localhost:8002'
      await fetch(`${base}/scenarios/library/${name}`, { method: 'DELETE' })
      message.success('Scenario eliminato')
      fetchAll()
    } catch {
      message.error('Errore durante l\'eliminazione')
    }
  }

  const handleLaunchSaved = (saved: SavedScenario) => {
    navigate(`/editor/custom`, { state: { config: saved.config, name: saved.name } })
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>

      {/* ── Header ── */}
      <header style={{
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        padding: '0 40px',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32,
              background: '#2563eb',
              borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ThunderboltOutlined style={{ color: '#fff', fontSize: 15 }} />
            </div>
            <span style={{ fontWeight: 800, fontSize: 16, color: '#0f172a', letterSpacing: '-0.02em' }}>
              DES Arena
            </span>
          </div>
          <Space>
            {backendOnline === true
              ? <Badge status="success" text={<Text style={{ fontSize: 12, color: '#64748b' }}>Online</Text>} />
              : backendOnline === false
              ? <Badge status="error"   text={<Text style={{ fontSize: 12, color: '#ef4444' }}>Offline</Text>} />
              : <Badge status="processing" text={<Text style={{ fontSize: 12, color: '#94a3b8' }}>Verifica...</Text>} />
            }
          </Space>
        </div>
        <button
          onClick={() => navigate('/editor/custom')}
          className="btn-primary"
        >
          <PlusOutlined /> Nuovo Progetto
        </button>
      </header>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 40px 80px' }}>

        {/* ── Hero ── */}
        <div className="fade-up-1" style={{ marginBottom: 48 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#eff6ff', color: '#2563eb',
            padding: '3px 12px', borderRadius: 20,
            fontSize: 11, fontWeight: 700,
            letterSpacing: '0.04em', textTransform: 'uppercase',
            marginBottom: 16,
          }}>
            <AppstoreOutlined /> Dashboard Simulazione
          </div>
          <h1 style={{
            fontSize: 32, fontWeight: 800,
            color: '#0f172a', margin: '0 0 10px',
            letterSpacing: '-0.03em', lineHeight: 1.2,
          }}>
            Benvenuto in <span style={{ color: '#2563eb' }}>DES Arena</span>
          </h1>
          <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.6, margin: 0, maxWidth: 560 }}>
            Progetta, simula e analizza sistemi complessi con SimPy. Scegli uno scenario predefinito o crea la tua rete personalizzata.
          </p>
        </div>

        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca',
            borderLeft: '3px solid #ef4444', borderRadius: 8,
            padding: '12px 16px', marginBottom: 32,
            fontSize: 13, color: '#991b1b',
          }}>
            {error}
          </div>
        )}

        {/* ── La Mia Libreria ── */}
        <section style={{ marginBottom: 48 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <SaveOutlined style={{ color: '#64748b', fontSize: 16 }} />
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>La Mia Libreria</h2>
              {library.length > 0 && (
                <span style={{
                  background: '#f1f5f9', color: '#64748b',
                  fontSize: 11, fontWeight: 600,
                  padding: '1px 8px', borderRadius: 20,
                }}>
                  {library.length}
                </span>
              )}
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 32, textAlign: 'center' }}><Spin /></div>
          ) : library.length === 0 ? (
            <div style={{
              background: '#fff', borderRadius: 12, padding: 40,
              textAlign: 'center', border: '1.5px dashed #e2e8f0',
            }}>
              <Empty description={<span style={{ color: '#94a3b8', fontSize: 13 }}>Nessun progetto salvato</span>} />
              <button
                onClick={() => navigate('/editor/custom')}
                className="btn-primary"
                style={{ marginTop: 16 }}
              >
                <PlusOutlined /> Crea il primo progetto
              </button>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 16,
            }}>
              {library.map((item) => (
                <div
                  key={item.name}
                  className="scenario-card"
                  style={{ borderLeft: '3px solid #10b981' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{item.name}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{item.created_at}</div>
                    </div>
                    <Tooltip title="Elimina">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteSaved(item.name) }}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: '#94a3b8', padding: 4, borderRadius: 4,
                          transition: 'color 0.15s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8' }}
                      >
                        <DeleteOutlined />
                      </button>
                    </Tooltip>
                  </div>
                  <button
                    onClick={() => handleLaunchSaved(item)}
                    className="btn-primary"
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    <PlayCircleOutlined /> Carica Progetto
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Scenari Predefiniti ── */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <AppstoreOutlined style={{ color: '#64748b', fontSize: 16 }} />
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>Scenari Accademici</h2>
            {scenarios.length > 0 && (
              <span style={{
                background: '#f1f5f9', color: '#64748b',
                fontSize: 11, fontWeight: 600,
                padding: '1px 8px', borderRadius: 20,
              }}>
                {scenarios.length}
              </span>
            )}
          </div>

          {loading ? (
            <div style={{ padding: 32, textAlign: 'center' }}><Spin /></div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 16,
            }}>
              {scenarios.map((s, i) => {
                const meta = ICON_MAP[s.icon] ?? ICON_MAP.SettingOutlined
                return (
                  <div
                    key={s.type}
                    className={`scenario-card ${STAGGER[i] ?? 'fade-up-6'}`}
                    style={{ borderLeft: `3px solid ${meta.color}` }}
                    onClick={() => navigate(`/editor/${s.type}`)}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                      <div style={{
                        width: 40, height: 40, flexShrink: 0,
                        background: meta.bg,
                        borderRadius: 8,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, color: meta.color,
                      }}>
                        {meta.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 3 }}>
                          {s.label}
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                          {s.description}
                        </div>
                      </div>
                    </div>

                    <div style={{
                      marginTop: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {['SimPy', 'KPI live'].map((tag) => (
                          <span key={tag} style={{
                            fontSize: 10, fontWeight: 700,
                            color: meta.color, background: meta.bg,
                            padding: '2px 8px', borderRadius: 20,
                            textTransform: 'uppercase', letterSpacing: '0.03em',
                          }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                      <span style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        color: meta.color, fontSize: 12, fontWeight: 700,
                      }}>
                        Avvia <ArrowRightOutlined />
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
