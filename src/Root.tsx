import { Link, Outlet } from 'react-router-dom'

import style from './style.module.css'

const Root = () => {
  return (
    <>
      <h1 className={style.hello}>Hello, world!</h1>
      <nav>
        <ul>
          <li>
            <Link to={'/'}>Home</Link>
          </li>
          <li>
            <Link to={'/posts'}>Posts</Link>
          </li>
          <li>
            <Link to={'/about'}>About</Link>
          </li>
        </ul>
      </nav>
      <Outlet />
    </>
  )
}

export default Root
