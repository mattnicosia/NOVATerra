// PageTransition — Route-level entrance + exit animation wrapper.
// Uses Framer Motion AnimatePresence for smooth page transitions.
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { pageVariants, pageTransition, useMotionSafe } from "@/utils/motion";

export default function PageTransition({ children }) {
  const location = useLocation();
  const motionSafe = useMotionSafe();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={pageVariants}
        transition={motionSafe ? pageTransition : { duration: 0 }}
        style={{ minHeight: "100%" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
