import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider, App as AntdApp } from 'antd'
import HomePage from './pages/HomePage'
import EditorPage from './pages/EditorPage'
import ArenaPage from './pages/ArenaPage'

export default function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary:         '#e8a020',
          colorSuccess:         '#3dd68c',
          colorWarning:         '#fbbf24',
          colorError:           '#f05050',
          colorInfo:            '#17b5cc',
          colorBgBase:          '#07090c',
          colorBgContainer:     '#0d1219',
          colorBgElevated:      '#131c27',
          colorBgLayout:        '#07090c',
          colorBorder:          '#182233',
          colorBorderSecondary: '#182233',
          colorText:            '#d8e8f6',
          colorTextSecondary:   '#6a88a4',
          colorTextTertiary:    '#334860',
          colorFillAlter:       '#0f1620',
          colorFillSecondary:   '#131c27',
          borderRadius:         2,
          borderRadiusLG:       4,
          borderRadiusSM:       1,
          fontFamily:           "'Rajdhani', 'Arial Narrow', Arial, sans-serif",
          fontSize:             15,
        },
        components: {
          Card: {
            headerBg:             '#0d1219',
            colorBorderSecondary: '#182233',
          },
          Form: {
            labelColor:    '#6a88a4',
            labelFontSize: 12,
          },
          Slider: {
            trackBg:           '#e8a020',
            trackHoverBg:      '#b87a10',
            handleColor:       '#e8a020',
            handleActiveColor: '#b87a10',
            railBg:            '#182233',
            railHoverBg:       '#1f3044',
          },
          Progress: {
            defaultColor:   '#e8a020',
            remainingColor: '#182233',
          },
          Button: {
            fontWeight:    700,
            primaryShadow: 'none',
          },
          Statistic: {
            titleFontSize:   12,
            contentFontSize: 26,
          },
          Badge: {
            fontSize: 11,
          },
          Select: {
            colorBgContainer: '#0f1620',
          },
          InputNumber: {
            colorBgContainer: '#0f1620',
          },
          Input: {
            colorBgContainer: '#0f1620',
          },
          Spin: {
            colorPrimary: '#e8a020',
          },
        },
      }}
    >
      <AntdApp>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/"                      element={<HomePage />} />
            <Route path="/editor/:scenarioType"  element={<EditorPage />} />
            <Route path="/arena/:simId"          element={<ArenaPage />} />
            <Route path="*"                      element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  )
}
