import { useEffect, useState } from 'react'
import { Toasts } from './components/ui.jsx'
import Home from './components/Home.jsx'
import GroupView from './components/GroupView.jsx'

const parse = () => {
  const m = location.hash.match(/^#\/g\/([\w-]+)/)
  return m ? { page: 'group', gid: m[1] } : { page: 'home' }
}

export default function App() {
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    const on = () => { setRoute(parse()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  return (
    <>
      <div className="app" key={route.gid || 'home'}>
        {route.page === 'group' ? <GroupView gid={route.gid} /> : <Home />}
      </div>
      <Toasts />
    </>
  )
}
