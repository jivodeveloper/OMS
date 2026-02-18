import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Modal, ScrollView, Dimensions } from 'react-native';
import { Text } from 'react-native-paper';
import AnimatedCard from './AnimatedCard';
import { COLORS, SPACING, RADIUS } from '@/src/constants/theme';
import { StatewiseEntry } from '@/src/types/dashboard';
import DonutChart from './DonutChart';

const STATE_COLORS = ['#0891B2', '#2563EB', '#8B5CF6', '#059669', '#F59E0B', '#DC2626', '#6366F1', '#EC4899', '#F97316', '#14B8A6'];

interface Props {
  data: StatewiseEntry[];
}

function buildSlice(data: StatewiseEntry[], limit: 5 | 10 | 0) {
  const sliced = limit === 0 ? [...data] : data.slice(0, limit);
  if (limit !== 0) {
    const rest = data.slice(limit);
    if (rest.length > 0) {
      const otherCount = rest.reduce((sum, d) => sum + d.orders, 0);
      sliced.push({ state: 'Other', orders: otherCount });
    }
  }
  return sliced;
}

export default function StatewiseBarChart({ data }: Props) {
  const [modalVisible, setModalVisible] = useState(false);
  const [modalLimit, setModalLimit] = useState<5 | 10 | 0>(5);

  // Card always shows top 5
  const cardSliced = buildSlice(data, 5);
  const cardTotal = cardSliced.reduce((sum, d) => sum + d.orders, 0);
  const cardChartData = cardSliced.map((entry, i) => ({
    label: entry.state,
    value: entry.orders,
    color: STATE_COLORS[i % STATE_COLORS.length],
  }));

  // Modal shows based on selected limit
  const modalSliced = buildSlice(data, modalLimit);
  const modalTotal = modalSliced.reduce((sum, d) => sum + d.orders, 0);

  const openModal = (limit: 5 | 10 | 0) => {
    setModalLimit(limit);
    setModalVisible(true);
  };

  const screenWidth = Dimensions.get('window').width;

  return (
    <AnimatedCard style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>State-wise</Text>
        <View style={styles.toggleRow}>
          <TouchableOpacity style={styles.toggleBtn} onPress={() => openModal(5)}>
            <Text style={styles.toggleText}>Top 5</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toggleBtn} onPress={() => openModal(10)}>
            <Text style={styles.toggleText}>Top 10</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toggleBtn} onPress={() => openModal(0)}>
            <Text style={styles.toggleText}>All</Text>
          </TouchableOpacity>
        </View>
      </View>
      <DonutChart
        data={cardChartData}
        size={110}
        strokeWidth={14}
        centerValue={String(cardTotal)}
        centerLabel="Orders"
        maxLegendItems={5}
      />

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { width: screenWidth - 32 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>State-wise Orders</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalToggleRow}>
              {([5, 10, 0] as const).map((val) => (
                <TouchableOpacity
                  key={val}
                  style={[styles.modalToggleBtn, modalLimit === val && styles.modalToggleActive]}
                  onPress={() => setModalLimit(val)}
                >
                  <Text style={[styles.modalToggleText, modalLimit === val && styles.modalToggleTextActive]}>
                    {val === 0 ? 'All' : `Top ${val}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <ScrollView showsVerticalScrollIndicator={true} style={styles.modalScroll}>
              {modalSliced.map((entry, i) => (
                <View key={i} style={styles.listItem}>
                  <View style={[styles.listDot, { backgroundColor: STATE_COLORS[i % STATE_COLORS.length] }]} />
                  <Text style={styles.listLabel} numberOfLines={1}>{entry.state}</Text>
                  <Text style={styles.listValue}>{entry.orders}</Text>
                </View>
              ))}
              <View style={styles.listTotal}>
                <Text style={styles.listTotalLabel}>Total</Text>
                <Text style={styles.listTotalValue}>{modalTotal}</Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </AnimatedCard>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  toggleRow: {
    flexDirection: 'row',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  toggleActive: {
    backgroundColor: COLORS.primary,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  toggleTextActive: {
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  modalToggleRow: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  modalToggleBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  modalToggleActive: {
    backgroundColor: COLORS.primary,
  },
  modalToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  modalToggleTextActive: {
    color: '#fff',
  },
  modalScroll: {
    flexGrow: 0,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  listDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  listLabel: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
  },
  listValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  listTotal: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
    borderTopWidth: 2,
    borderTopColor: COLORS.border,
  },
  listTotalLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  listTotalValue: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primary,
  },
});