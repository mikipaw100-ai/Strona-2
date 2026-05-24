import React from 'react';
import { CLIENT_REVIEWS } from '../data';
import { Star, MessageSquare } from 'lucide-react';
import { motion } from 'motion/react';

export default function ReviewList() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-transparent">
      {CLIENT_REVIEWS.map((rev, index) => (
        <motion.div
          key={rev.id}
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3, delay: index * 0.1 }}
          className="p-6 bg-white border border-stone-200/60 rounded-3xl shadow-sm flex flex-col justify-between hover:border-[#4c5c47]/30 hover:shadow-md transition duration-300"
        >
          <div className="space-y-3">
            {/* Stars rating */}
            <div className="flex items-center gap-0.5 text-yellow-500">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-4 h-4 fill-yellow-500 text-yellow-500" />
              ))}
            </div>
            
            <p className="text-stone-600 text-sm leading-relaxed italic font-sans font-light">
              "{rev.text}"
            </p>
          </div>

          <div className="pt-4 border-t border-stone-100 flex items-center justify-between mt-4">
            <span className="text-xs font-bold text-[#477267] font-serif">{rev.patientName}</span>
            <span className="text-[10px] text-stone-400 font-mono">{rev.date}</span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
