import React from "react";

export default function PlaceholderScreen({ title, description }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="w-16 h-16 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </div>
        <h2 className="text-gray-600 font-semibold text-base mb-1">{title}</h2>
        <p className="text-gray-400 text-sm max-w-xs">{description}</p>
        <p className="text-gray-300 text-xs mt-3 tracking-widest uppercase">Coming soon</p>
      </div>
    </div>
  );
}
