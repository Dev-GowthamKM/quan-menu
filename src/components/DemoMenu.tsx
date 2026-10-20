"use client";
import { useEffect, useState } from "react";
import type { MenuData } from "@/lib/types";
import { DEMO_KEY } from "@/lib/config";
import MenuView from "./MenuView";

/** Demo mode only: shows the menu saved in this browser by the editor. */
export default function DemoMenu({ slug }: { slug: string }) {
  const [menu, setMenu] = useState<MenuData | null | undefined>(undefined);
  useEffect(() => {
    try {
      const m = JSON.parse(localStorage.getItem(DEMO_KEY) || "null") as MenuData | null;
      setMenu(m && m.slug === slug ? m : null);
    } catch {
      setMenu(null);
    }
  }, [slug]);

  if (menu === undefined) return null;
  if (!menu) return <NotFoundBody />;
  return <MenuView full name={menu.name} area={menu.area} dishes={menu.dishes} toppings={menu.toppings} pay={menu.pay} maps={menu.maps} />;
}

function NotFoundBody() {
  return (
    <main className="notfound">
      <h1>Không tìm thấy thực đơn · Menu not found</h1>
      <p className="status">Ở chế độ dùng thử, thực đơn chỉ mở được trên trình duyệt đã lưu nó.</p>
      <p className="status" lang="en">In demo mode, menus only open in the browser that saved them.</p>
      <a className="btn" href="/">Về trang Quán · Go to Quán</a>
    </main>
  );
}
