import type { KnowledgePage } from "./knowledge";

type Props = {
  page: KnowledgePage;
  value: string;
  saveState: string;
  onChange: (value: string) => void;
};

export function KnowledgePane({ page, value, saveState, onChange }: Props) {
  return (
    <div className="knowledge-pane">
      <div className="editor-head">
        <div className="breadcrumbs">作品资料</div>
        <div className="title-row">
          <div>
            <h1>{page.title}</h1>
            <p>{page.hint}</p>
          </div>
        </div>
      </div>
      <textarea
        className="knowledge-editor"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={page.placeholder}
      />
      <footer className="editor-footer"><span role="status">{saveState}</span><span>续写时自动带入</span></footer>
    </div>
  );
}
