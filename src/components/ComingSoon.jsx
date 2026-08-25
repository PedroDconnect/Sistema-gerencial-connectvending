import { Icon } from "./Icon";

export function ComingSoon({ label, icon }) {
  return (
    <main className="main">
      <header className="topbar">
        <div>
          <h1 className="topbar__title">{label}</h1>
          <p className="topbar__subtitle">Este módulo ainda não está conectado a uma fonte de dados real.</p>
        </div>
      </header>
      <section className="card coming-soon">
        <span className="coming-soon__icon">
          <Icon name={icon} size={22} />
        </span>
        <h2>Em breve</h2>
        <p>Assim que a integração de dados deste módulo estiver disponível, ele será implementado aqui.</p>
      </section>
    </main>
  );
}
