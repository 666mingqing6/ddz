interface Props {
  small?: boolean;
}

/** 品牌标识：三张叠放的扑克牌 + 描金标题（纯 CSS 绘制，不依赖 emoji 字体） */
export function LogoMark({ small }: Props) {
  return (
    <div className={`logo ${small ? 'logo--sm' : ''}`}>
      <div className="logo__cards">
        <i className="logo__card logo__card--1">
          <b>A</b>
          <span>♠</span>
        </i>
        <i className="logo__card logo__card--2">
          <b>K</b>
          <span>♥</span>
        </i>
        <i className="logo__card logo__card--3">
          <b>Q</b>
          <span>♣</span>
        </i>
      </div>
      <div className="logo__text">
        <h1>斗地主</h1>
        {!small && <p>HAPPY LANDLORD · 网页版</p>}
      </div>
    </div>
  );
}
