import { MatchInfo } from '../components/MatchInfo';
import { MatchTools } from '../components/MatchTools';
import { useMatchPage } from './MatchPageLayout';

export function MatchDetailPage() {
  const { detail, log, calls, reload } = useMatchPage();
  return <>
    <section aria-labelledby="match-info-title">
      <h1 id="match-info-title">对局信息</h1>
      <MatchInfo detail={detail} log={log} calls={calls} />
    </section>
    <MatchTools detail={detail} log={log} calls={calls} onChanged={() => void reload()} />
  </>;
}
