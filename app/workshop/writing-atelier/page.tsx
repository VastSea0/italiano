"use client";
import React, { useState, useEffect } from "react";

export default function WritingAtelierPage() {
  const activities = [
    { key: "diario", label: "Günlük Yazısı (Diario)" },
    { key: "traduzione", label: "Hikaye/Şarkı Sözü Çevirisi (Traduzione)" },
    { key: "dialogo", label: "Diyalog Oluşturma/Çevirme (Dialogo)" },
  ];
  const [selectedActivity, setSelectedActivity] = useState("diario");
  const [userText, setUserText] = useState("");

  // API'den dinamik içerik çekme
  const [activityContent, setActivityContent] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetch(`/api/atelier?type=${selectedActivity}`)
      .then(res => {
        if (!res.ok) throw new Error("API hatası");
        return res.json();
      })
      .then(data => {
        setActivityContent(data);
        setLoading(false);
        })
        .catch(err => {
          setError("Veri alınamadı.");
          setLoading(false);
        });
    }, [selectedActivity]);

    // Word count helper
    const wordCount = userText.trim().length > 0 ? userText.trim().split(/\s+/).length : 0;

    return (
      <main className="flex flex-col min-h-screen p-4 bg-white dark:bg-gray-950">
        <h1 className="text-2xl font-bold mb-4 text-center">İtalyanca Yazma Atölyesi</h1>
        {/* Aktivite seçimi */}
        <div className="flex justify-center mb-6">
          <nav className="inline-flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-900">
            {activities.map((activity) => (
              <button
                key={activity.key}
                className={`px-4 py-2 text-sm font-medium focus:outline-none transition-colors duration-150 ${selectedActivity === activity.key ? "bg-brand-500 text-white" : "bg-transparent text-gray-700 dark:text-gray-300 hover:bg-brand-400/10"}`}
                onClick={() => setSelectedActivity(activity.key)}
              >
                {activity.label}
              </button>
            ))}
          </nav>
        </div>
        {/* İçerik ve yardımcı alanlar */}
        <div className="flex flex-1 gap-6">
          {/* Sol Bölme: Kaynak/İlham */}
          <section className="flex-1 bg-gray-50 dark:bg-gray-900 rounded-lg p-4 shadow">
            <h2 className="text-lg font-semibold mb-2">Kaynak / İlham</h2>
            {loading && <div className="loading">Yükleniyor...</div>}
            {error && <div className="text-red-500">{error}</div>}
            {!loading && !error && activityContent && selectedActivity === "diario" && (
              <div>
                <div className="mb-2 text-gray-700 dark:text-gray-300">{activityContent.scenario}</div>
              </div>
            )}
            {!loading && !error && activityContent && selectedActivity === "traduzione" && (
              <div>
                <div className="mb-2 text-gray-700 dark:text-gray-300">Çevrilecek metin:</div>
                <blockquote className="p-2 border-l-4 border-brand-500 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 italic">{activityContent.sourceText}</blockquote>
              </div>
            )}
            {!loading && !error && activityContent && selectedActivity === "dialogo" && (
              <div>
                <div className="mb-2 text-gray-700 dark:text-gray-300">{activityContent.scenario}</div>
              </div>
            )}
          </section>
          {/* Sağ Bölme: Kullanıcı Yazı Alanı */}
          <section className="flex-1 bg-gray-50 dark:bg-gray-900 rounded-lg p-4 shadow flex flex-col">
            <h2 className="text-lg font-semibold mb-2">Yazınız</h2>
            <textarea
              className="flex-1 resize-none rounded border p-2 mb-2"
              placeholder="İtalyanca metninizi buraya yazın..."
              value={userText}
              onChange={e => setUserText(e.target.value)}
            />
            <div className="text-right text-sm text-gray-500">Kelime sayısı: {wordCount}</div>
          </section>
          {/* Yardımcı Alan: Kelime/İfade Havuzu */}
          <aside className="w-64 bg-gray-100 dark:bg-gray-800 rounded-lg p-4 shadow">
            <h2 className="text-lg font-semibold mb-2">Kelime & İfade Havuzu</h2>
            {loading && <div className="loading">Yükleniyor...</div>}
            {error && <div className="text-red-500">{error}</div>}
            {!loading && !error && activityContent && selectedActivity === "diario" && (
              <ul className="list-disc pl-4">
                {activityContent.vocabulary?.map((word: string) => (
                  <li key={word} className="mb-1 text-brand-700 dark:text-brand-300">{word}</li>
                ))}
              </ul>
            )}
            {!loading && !error && activityContent && selectedActivity === "traduzione" && (
              <ul className="list-disc pl-4">
                {activityContent.vocabulary?.map((word: string) => (
                  <li key={word} className="mb-1 text-brand-700 dark:text-brand-300">{word}</li>
                ))}
              </ul>
            )}
            {!loading && !error && activityContent && selectedActivity === "dialogo" && (
              <div>
                {activityContent.expressions?.map((exp: any) => (
                  <div key={exp.category} className="mb-2">
                    <div className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-1">{exp.category}</div>
                    <ul className="list-disc pl-4">
                      {exp.phrases.map((phrase: string) => (
                        <li key={phrase} className="mb-1 text-brand-700 dark:text-brand-300">{phrase}</li>
                      ))}
                    </ul>
                  </div>
                ))}
                <div className="mt-2 font-semibold text-sm text-gray-700 dark:text-gray-300">Ek Kelimeler</div>
                <ul className="list-disc pl-4">
                  {activityContent.vocabulary?.map((word: string) => (
                    <li key={word} className="mb-1 text-brand-700 dark:text-brand-300">{word}</li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </main>
    );
  }
