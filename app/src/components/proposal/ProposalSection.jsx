import { isPageBreak, isSpacer, isUploadedDoc } from '@/constants/proposalSections';
import CoverLetterSection from './CoverLetterSection';
import Letterhead from './sections/Letterhead';
import Recipient from './sections/Recipient';
import Greeting from './sections/Greeting';
import IntroParagraph from './sections/IntroParagraph';
import ScopeOfWork from './sections/ScopeOfWork';
import BaseBid from './sections/BaseBid';
import Alternates from './sections/Alternates';
import Exclusions from './sections/Exclusions';
import Allowances from './sections/Allowances';
import Clarifications from './sections/Clarifications';
import Qualifications from './sections/Qualifications';
import Closing from './sections/Closing';
import Signature from './sections/Signature';
import Acceptance from './sections/Acceptance';
import ScheduleOfValues from './sections/ScheduleOfValues';
import PageBreak from './sections/PageBreak';
import Spacer from './sections/Spacer';
import UploadedDocumentSection from './UploadedDocumentSection';
import CostTreemap from './CostTreemap';

const SECTION_MAP = {
  coverLetter: CoverLetterSection,
  letterhead: Letterhead,
  recipient: Recipient,
  greeting: Greeting,
  intro: IntroParagraph,
  scope: ScopeOfWork,
  baseBid: BaseBid,
  alternates: Alternates,
  exclusions: Exclusions,
  allowances: Allowances,
  clarifications: Clarifications,
  qualifications: Qualifications,
  closing: Closing,
  signature: Signature,
  acceptance: Acceptance,
  sov: ScheduleOfValues,
};

export default function ProposalSection({ sectionId, data, proposalStyles, sectionNumber }) {
  if (isPageBreak(sectionId)) return <PageBreak />;
  if (isSpacer(sectionId)) return <Spacer />;
  if (isUploadedDoc(sectionId)) return <UploadedDocumentSection sectionId={sectionId} proposalStyles={proposalStyles} />;

  // Cost distribution graph section
  if (sectionId === "costGraph") {
    const { divTotals = {}, totals = {} } = data;
    const grand = totals?.grand || 0;
    if (!divTotals || !Object.keys(divTotals).length) return null;
    return (
      <div style={{ marginTop: 32, marginBottom: 32 }}>
        <div style={{ ...proposalStyles.type.h2, fontFamily: proposalStyles.font.body, color: proposalStyles.color.accent, marginBottom: 16 }}>
          COST DISTRIBUTION
        </div>
        <CostTreemap divTotals={divTotals} grand={grand} accent={proposalStyles.color.accent} font={proposalStyles.font.body} />
      </div>
    );
  }

  const Comp = SECTION_MAP[sectionId];
  if (!Comp) return null;
  return <Comp data={data} proposalStyles={proposalStyles} sectionNumber={sectionNumber} />;
}
