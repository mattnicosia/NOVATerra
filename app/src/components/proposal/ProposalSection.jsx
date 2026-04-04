import { isPageBreak, isSpacer } from '@/constants/proposalSections';
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

export default function ProposalSection({ sectionId, data }) {
  if (isPageBreak(sectionId)) return <PageBreak />;
  if (isSpacer(sectionId)) return <Spacer />;

  const Comp = SECTION_MAP[sectionId];
  if (!Comp) return null;
  return <Comp data={data} />;
}
