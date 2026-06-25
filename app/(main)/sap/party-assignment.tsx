import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  ActivityIndicator,
  TextInput,
  Platform,
  Modal,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { storage } from '@/src/utils/storage';
import { api } from '@/src/services/api';

interface User {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
  role_id: number;
  category?: { id: number; category: string } | null;
  categories?: ({ id: number; category: string } | string)[] | null;
}

// All categories assigned to a user (OIL / BEVERAGES / MART), falling back to
// the single primary category for users created before multi-category support.
const getUserCategories = (user?: User | null): string[] => {
  const list = Array.isArray(user?.categories) ? user!.categories : [];
  const names = list
    .map((c) => normalizeCategory(typeof c === 'string' ? c : c?.category))
    .filter(Boolean);
  if (names.length) return Array.from(new Set(names));
  const primary = normalizeCategory(user?.category?.category);
  return primary ? [primary] : [];
};

interface Party {
  id?: number;
  card_code: string;
  card_name: string;
  state: string;
  main_group: string;
  category?: string;
  assigned_at?: string;
  party_key?: string;
}

const normalizeCategory = (value?: string | null) => {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized || '';
};

const getPartyKey = (party: Pick<Party, 'card_code' | 'category'>) =>
  `${String(party.card_code || '').trim()}||${normalizeCategory(party.category)}`;

const parsePartyKey = (partyKey: string) => {
  const [card_code, rawCategory] = String(partyKey || '').split('||');
  return {
    card_code: String(card_code || '').trim(),
    category: normalizeCategory(rawCategory) || null,
  };
};

export default function PartyAssignmentScreen() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [assignedPartiesData, setAssignedPartiesData] = useState<Party[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  // Which of the selected user's categories we're assigning parties for.
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [assignedPartyKeys, setAssignedPartyKeys] = useState<Set<string>>(new Set());
  const [tempSelectedKeys, setTempSelectedKeys] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState('');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (selectedUserId) {
      const user = users.find((u) => u.id === selectedUserId) || null;
      const defaultCategory = getUserCategories(user)[0] || '';
      setSelectedCategory(defaultCategory);
      loadUserParties(selectedUserId, defaultCategory);
    } else {
      setSelectedCategory('');
      setAssignedPartiesData([]);
      setAssignedPartyKeys(new Set<string>());
    }
  }, [selectedUserId]);

  useFocusEffect(
    useCallback(() => {
      loadUsers();
      loadAllParties();
      
      return () => {
        setSelectedUserId(null);
        setSelectedCategory('');
        setAssignedPartiesData([]);
        setAssignedPartyKeys(new Set());
        setTempSelectedKeys(new Set());
        setMessage('');
        setShowAssignModal(false);
        setShowUserPicker(false);
      };
    }, [])
  );

  const getToken = async (): Promise<string | undefined> => {
    const token = await storage.getAccessToken();
    return token || undefined;
  };

  const loadUsers = async () => {
    try {
      const token = await getToken();
      const res = await api.get('/auth/users/list/', token);
      if (res) {
        const list = Array.isArray(res) ? res : (res.data || res.results || []);
        console.log('First user sample:', JSON.stringify(list[0]));
        const managers = list.filter((u: any) =>
          u.role_id === 2 || u.role_id === 4 ||
          Number(u.role) === 2 || Number(u.role) === 4 ||
          u.role?.toLowerCase() === 'manager' ||
          u.role?.toLowerCase() === 'billing'
        );
        console.log(`Total users: ${list.length}, Managers: ${managers.length}`);
        setUsers(managers);
      }
    } catch (error) {
      console.log('Load users error:', error);
    }
  };

  const loadAllParties = async () => {
    if (parties.length === 0) setLoading(true);
    try {
      const token = await getToken();
      const res = await api.get('/sap/parties/?page_size=5000', token);
      console.log('Parties response:', res);
      const partiesList = Array.isArray(res) ? res : (res?.results || res?.data || []);
      setParties(
        partiesList.map((party: Party) => ({
          ...party,
          party_key: getPartyKey(party),
        }))
      );
    } catch (error) {
      console.log('Load parties error:', error);
    }
    setLoading(false);
  };

  const loadUserParties = async (userId: number, category?: string) => {
    if (assignedPartyKeys.size === 0) setLoading(true);
    setMessage('');
    try {
      const token = await getToken();
      // Scope to the chosen category (one of the user's categories); the backend
      // defaults to the user's primary category when none is supplied.
      const cat = category !== undefined ? category : selectedCategory;
      const url = cat
        ? `/auth/users/${userId}/parties/?category=${encodeURIComponent(cat)}`
        : `/auth/users/${userId}/parties/`;
      const res = await api.get(url, token);
      console.log('User parties response:', res);
      if (res && res.success) {
        const assignedParties = Array.isArray(res.data.parties)
          ? res.data.parties.map((party: Party) => ({
              ...party,
              party_key: party.party_key || getPartyKey(party),
            }))
          : [];
        const keys = new Set<string>(
          res.data.party_keys ||
          assignedParties.map((party: Party) => party.party_key || getPartyKey(party))
        );
        setAssignedPartiesData(assignedParties);
        setAssignedPartyKeys(keys);
      } else {
        setAssignedPartiesData([]);
        setAssignedPartyKeys(new Set<string>());
      }
    } catch (error) {
      console.log('Load user parties error:', error);
      setAssignedPartiesData([]);
      setAssignedPartyKeys(new Set<string>());
    }
    setLoading(false);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadUsers(), loadAllParties()]);
    if (selectedUserId) {
      await loadUserParties(selectedUserId);
    }
    setRefreshing(false);
  }, [selectedUserId]);

  const openAssignModal = () => {
    // Copy current assigned codes to temp selection
    setTempSelectedKeys(new Set(assignedPartyKeys));
    setSearchQuery('');
    setShowAssignModal(true);
  };

  const togglePartySelection = (party: Party) => {
    const partyKey = party.party_key || getPartyKey(party);
    setTempSelectedKeys(prev => {
      const newSet = new Set(prev);
      if (newSet.has(partyKey)) {
        newSet.delete(partyKey);
      } else {
        newSet.add(partyKey);
      }
      return newSet;
    });
  };

  const selectAllFiltered = () => {
    const filteredKeys = filteredParties.map((party) => party.party_key || getPartyKey(party));
    setTempSelectedKeys(prev => {
      const newSet = new Set(prev);
      filteredKeys.forEach(key => newSet.add(key));
      return newSet;
    });
  };

  const deselectAllFiltered = () => {
    const filteredKeys = new Set(filteredParties.map((party) => party.party_key || getPartyKey(party)));
    setTempSelectedKeys(prev => {
      const newSet = new Set(prev);
      filteredKeys.forEach(key => newSet.delete(key));
      return newSet;
    });
  };

  const saveAssignments = async () => {
    if (!selectedUserId) {
      setMessage('❌ Please select a user first');
      return;
    }

    setSaving(true);
    setMessage('');

    try {
      const token = await getToken();
      // Backend (AssignPartiesView) expects a flat `card_codes` list and derives
      // the category from the selected user, so send card codes only.
      const cardCodes = Array.from(
        new Set(
          Array.from(tempSelectedKeys)
            .map((partyKey) => parsePartyKey(partyKey).card_code)
            .filter(Boolean),
        ),
      );

      console.log('Saving assignments:', {
        user_id: selectedUserId,
        card_codes: cardCodes,
        category: selectedCategory,
      });

      // Assign within the currently selected category so assigning for one
      // category never disturbs parties in another.
      const res = await api.post('/auth/assign-parties/', {
        user_id: selectedUserId,
        card_codes: cardCodes,
        ...(selectedCategory ? { category: selectedCategory } : {}),
      }, token);

      console.log('Save response:', res);

      if (res && res.success) {
        setMessage(`✅ ${res.message}`);
        await loadUserParties(selectedUserId, selectedCategory);
        setShowAssignModal(false);
      } else {
        setMessage(`❌ ${res?.message || 'Failed to save'}`);
      }
    } catch (error) {
      console.log('Save error:', error);
      setMessage('❌ Failed to save assignments');
    }
    setSaving(false);
  };

  const removeParty = async (party: Party) => {
    if (!selectedUserId) return;

    try {
      const token = await getToken();
      const partyKey = party.party_key || getPartyKey(party);
      const parsed = parsePartyKey(partyKey);
      const res = await api.post('/auth/remove-party/', {
        user_id: selectedUserId,
        card_code: parsed.card_code,
        category: parsed.category,
      }, token);

      console.log('Remove response:', res);

      if (res && res.success) {
        await loadUserParties(selectedUserId);
        setMessage('✅ Party removed');
      } else {
        setMessage(`❌ ${res?.message || 'Failed to remove'}`);
      }
    } catch (error) {
      console.log('Remove error:', error);
      setMessage('❌ Failed to remove party');
    }
  };

  const handleCategoryChange = (cat: string) => {
    if (cat === selectedCategory) return;
    setSelectedCategory(cat);
    setMessage('');
    if (selectedUserId) loadUserParties(selectedUserId, cat);
  };

  const selectedUser = users.find(u => u.id === selectedUserId);
  const userCategories = getUserCategories(selectedUser);
  // The category currently being assigned for (defaults to the user's first).
  const effectiveCategory = selectedCategory || userCategories[0] || '';

  const filteredParties = parties.filter(p => {
    const matchesSearch = p.card_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.card_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.state?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.main_group?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      !effectiveCategory || normalizeCategory(p.category) === effectiveCategory;

    return matchesSearch && matchesCategory;
  });

  const assignedParties = assignedPartiesData.filter((party) =>
    !effectiveCategory || normalizeCategory(party.category) === effectiveCategory
  );
  
  return (
    <View style={styles.container}>
      {/* <View style={styles.header}>
        <Text style={styles.headerTitle}>Party Assignment</Text>
        <Text style={styles.headerSubtitle}>Assign parties to users using Card Code</Text>
      </View> */}

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1e3a5f']} />
        }
      >
        {/* User Selection */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Select User</Text>
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => { setUserSearch(''); setShowUserPicker(true); }}
          >
            <Text style={selectedUserId ? styles.pickerButtonText : styles.pickerButtonPlaceholder}>
              {selectedUser
                ? `${selectedUser.name || selectedUser.username} (${selectedUser.role || 'User'})`
                : '-- Select User --'}
            </Text>
            <Ionicons name="chevron-down" size={18} color="#666" />
          </TouchableOpacity>
        </View>

        {/* Message */}
        {message ? (
          <View style={styles.messageContainer}>
            <Text style={styles.messageText}>{message}</Text>
          </View>
        ) : null}

        {/* Selected User Info & Actions */}
        {selectedUserId && (
          <View style={styles.card}>
            <View style={styles.userInfoHeader}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={styles.userName}>{selectedUser?.name || selectedUser?.username}</Text>
                <Text style={styles.userCategory}>
                  {userCategories.length ? `Categories: ${userCategories.join(', ')}` : 'No Category Assigned'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.assignButton}
                onPress={openAssignModal}
              >
                <Ionicons name="add-circle-outline" size={20} color="#fff" />
                <Text style={styles.assignButtonText}>
                  {assignedPartyKeys.size > 0 ? 'Edit Parties' : 'Assign Parties'}
                </Text>
              </TouchableOpacity>
            </View>

            {userCategories.length > 1 && (
              <View style={styles.categorySelectorWrap}>
                <Text style={styles.categorySelectorLabel}>Assigning parties for</Text>
                <View style={styles.categoryChips}>
                  {userCategories.map((cat) => {
                    const active = effectiveCategory === cat;
                    return (
                      <TouchableOpacity
                        key={cat}
                        style={[styles.categoryChip, active && styles.categoryChipActive]}
                        onPress={() => handleCategoryChange(cat)}
                      >
                        <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>
                          {cat}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{assignedPartyKeys.size}</Text>
                <Text style={styles.statLabel}>Assigned Parties</Text>
              </View>
            </View>
          </View>
        )}

        {/* Assigned Parties List */}
        {selectedUserId && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Assigned Parties</Text>

            {loading && !refreshing ? (
              <ActivityIndicator size="large" color="#1e3a5f" />
            ) : assignedParties.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="people-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>No parties assigned</Text>
                <Text style={styles.emptySubtext}>Click Assign Parties to add</Text>
              </View>
            ) : (
              <View>
                {assignedParties.map(party => (
                  <View key={party.party_key || getPartyKey(party)} style={styles.partyItem}>
                    <View style={styles.partyInfo}>
                      <Text style={styles.partyCode}>{party.card_code}</Text>
                      <Text style={styles.partyName}>{party.card_name}</Text>
                      <Text style={styles.partyDetails}>
                    {party.state || '-'} • {party.main_group || '-'} • {party.category || '-'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => removeParty(party)}
                    >
                      <Ionicons name="close-circle" size={24} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* User Picker Bottom Sheet */}
      <Modal
        visible={showUserPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowUserPicker(false)}
      >
        <TouchableOpacity
          style={styles.pickerModalOverlay}
          activeOpacity={1}
          onPress={() => setShowUserPicker(false)}
        >
          <View style={styles.pickerModalSheet}>
            <View style={styles.pickerModalToolbar}>
              <Text style={styles.pickerModalTitle}>Select User</Text>
              <TouchableOpacity onPress={() => setShowUserPicker(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={18} color="#999" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search user..."
                value={userSearch}
                onChangeText={setUserSearch}
              />
              {userSearch.length > 0 && (
                <TouchableOpacity onPress={() => setUserSearch('')}>
                  <Ionicons name="close-circle" size={18} color="#999" />
                </TouchableOpacity>
              )}
            </View>
            <FlatList
              data={users.filter(u =>
                u.name?.toLowerCase().includes(userSearch.toLowerCase()) ||
                u.username?.toLowerCase().includes(userSearch.toLowerCase())
              )}
              keyExtractor={item => String(item.id)}
              style={styles.userPickerList}
              renderItem={({ item: user }) => (
                <TouchableOpacity
                  style={[
                    styles.userPickerItem,
                    selectedUserId === user.id && styles.userPickerItemSelected,
                  ]}
                  onPress={() => {
                    setSelectedUserId(user.id);
                    setMessage('');
                    setShowUserPicker(false);
                  }}
                >
                  <View style={styles.userPickerInfo}>
                    <Text style={styles.userPickerName}>
                      {user.name || user.username}
                    </Text>
                  </View>
                  {selectedUserId === user.id && (
                    <Ionicons name="checkmark" size={20} color="#1e3a5f" />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Assign Modal */}
      <Modal
        visible={showAssignModal}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowAssignModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Parties</Text>
            <TouchableOpacity onPress={() => setShowAssignModal(false)} disabled={saving}>
              <Ionicons name="close" size={28} color="#333" />
            </TouchableOpacity>
          </View>

          {/* Saving overlay */}
          {saving && (
            <View style={styles.savingOverlay}>
              <View style={styles.savingBox}>
                <ActivityIndicator size="large" color="#1e3a5f" />
                <Text style={styles.savingText}>Saving assignments...</Text>
                <Text style={styles.savingSubtext}>{tempSelectedKeys.size} parties selected</Text>
              </View>
            </View>
          )}

          {/* Search */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by code, name, state, group..."
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          {/* Selection Actions */}
          <View style={styles.selectionActions}>
            <TouchableOpacity style={styles.selectAllBtn} onPress={selectAllFiltered}>
              <Text style={styles.selectAllText}>Select All ({filteredParties.length})</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deselectAllBtn} onPress={deselectAllFiltered}>
              <Text style={styles.deselectAllText}>Deselect All</Text>
            </TouchableOpacity>
            <View style={styles.selectedCount}>
              <Text style={styles.selectedCountText}>{tempSelectedKeys.size} selected</Text>
            </View>
          </View>

          {/* Parties List */}
          {loading ? (
            <View style={styles.modalLoadingContainer}>
              <ActivityIndicator size="large" color="#1e3a5f" />
              <Text style={styles.modalLoadingText}>Loading parties...</Text>
            </View>
          ) : (
          <FlatList
            data={filteredParties}
            keyExtractor={item => item.party_key || getPartyKey(item)}
            style={styles.modalList}
            extraData={tempSelectedKeys}
            initialNumToRender={20}
            maxToRenderPerBatch={20}
            windowSize={10}
            renderItem={({ item: party }) => {
              const isSelected = tempSelectedKeys.has(party.party_key || getPartyKey(party));
              return (
                <TouchableOpacity
                  style={[styles.partySelectItem, isSelected && styles.partySelectItemSelected]}
                  onPress={() => togglePartySelection(party)}
                >
                  <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                    {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
                  </View>
                  <View style={styles.partySelectInfo}>
                    <Text style={styles.partySelectCode}>{party.card_code}</Text>
                    <Text style={styles.partySelectName}>{party.card_name}</Text>
                    <Text style={styles.partySelectDetails}>
                      {party.state || '-'} • {party.main_group || '-'} • {party.category || '-'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
          )}

          {/* Save Button */}
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowAssignModal(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.saveButton}
              onPress={saveAssignments}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>Save ({tempSelectedKeys.size})</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#1e3a5f',
    padding: 20,
    paddingTop: Platform.OS === 'web' ? 20 : 50,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginTop: 5,
  },
  content: {
    padding: 15,
    flex: 1,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  pickerContainer: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  picker: {
    height: 50,
  },
  messageContainer: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
  },
  messageText: {
    fontSize: 14,
    color: '#333',
  },
  userInfoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  userName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  userCategory: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  categorySelectorWrap: {
    marginBottom: 15,
  },
  categorySelectorLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 6,
    fontWeight: '600',
  },
  categoryChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
    marginRight: 8,
    marginBottom: 8,
  },
  categoryChipActive: {
    backgroundColor: '#1e3a5f',
    borderColor: '#1e3a5f',
  },
  categoryChipText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
  },
  categoryChipTextActive: {
    color: '#fff',
  },
  userRole: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  assignButton: {
    backgroundColor: '#1e3a5f',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 8,
  },
  assignButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    marginLeft: 5,
  },
  statsRow: {
    flexDirection: 'row',
  },
  statBox: {
    backgroundColor: '#e8f4fc',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e3a5f',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 30,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginTop: 10,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 5,
  },
  partyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  partyInfo: {
    flex: 1,
  },
  partyCode: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1e3a5f',
  },
  partyName: {
    fontSize: 15,
    color: '#333',
    marginTop: 2,
  },
  partyDetails: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  removeButton: {
    padding: 5,
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: Platform.OS === 'web' ? 20 : 50,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    margin: 15,
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    padding: 12,
    color: '#000000',
    fontSize: 16,
  },
  selectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    marginBottom: 10,
  },
  selectAllBtn: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginRight: 10,
  },
  selectAllText: {
    color: '#1e40af',
    fontWeight: '600',
    fontSize: 13,
  },
  deselectAllBtn: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginRight: 10,
  },
  deselectAllText: {
    color: '#dc2626',
    fontWeight: '600',
    fontSize: 13,
  },
  selectedCount: {
    flex: 1,
    alignItems: 'flex-end',
  },
  selectedCountText: {
    color: '#666',
    fontWeight: '600',
  },
  modalList: {
    flex: 1,
    paddingHorizontal: 15,
  },
  partySelectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  partySelectItemSelected: {
    backgroundColor: '#eff6ff',
    borderColor: '#1e3a5f',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#d1d5db',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#1e3a5f',
    borderColor: '#1e3a5f',
  },
  partySelectInfo: {
    flex: 1,
  },
  partySelectCode: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1e3a5f',
  },
  partySelectName: {
    fontSize: 15,
    color: '#333',
    marginTop: 2,
  },
  partySelectDetails: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
  },
  cancelButton: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    marginRight: 10,
  },
  cancelButtonText: {
    color: '#666',
    fontWeight: 'bold',
  },
  saveButton: {
    flex: 2,
    padding: 15,
    borderRadius: 8,
    backgroundColor: '#1e3a5f',
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  pickerButtonText: {
    fontSize: 15,
    color: '#333',
  },
  pickerButtonPlaceholder: {
    fontSize: 15,
    color: '#999',
  },
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  pickerModalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 30,
  },
  pickerModalToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  pickerModalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  pickerModalDone: {
    fontSize: 16,
    color: '#1e3a5f',
    fontWeight: 'bold',
  },
  savingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  savingBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  savingText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e3a5f',
  },
  savingSubtext: {
    marginTop: 6,
    fontSize: 13,
    color: '#666',
  },
  modalLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  modalLoadingText: {
    marginTop: 12,
    fontSize: 15,
    color: '#666',
  },
  userPickerList: {
    maxHeight: 350,
  },
  userPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  userPickerItemSelected: {
    backgroundColor: '#eff6ff',
  },
  userPickerInfo: {
    flex: 1,
  },
  userPickerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  userPickerRole: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
});
